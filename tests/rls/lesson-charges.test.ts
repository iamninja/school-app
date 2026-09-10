import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { signInAs, serviceClient } from "./helpers";
import { cleanupFixtures, createFixtures, type Fixtures } from "./fixtures";

/**
 * post_lesson_charge_row() is the load-bearing correctness surface here:
 * an attendance mark on a per_lesson class must post/reprice/remove a
 * lesson_charge row idempotently, and - the trap that motivated the "OF
 * status" trigger scope - deleting a class (which SET NULLs class_id on
 * its attendance rows) must never touch the charges it already produced.
 */
describe("RLS: per-lesson billing (attendance -> family_balance_transactions)", () => {
  let fixtures: Fixtures;
  let teacherA: Awaited<ReturnType<typeof signInAs>>;
  let teacherB: Awaited<ReturnType<typeof signInAs>>;
  let parentA1: Awaited<ReturnType<typeof signInAs>>;
  const admin = serviceClient();
  const createdAttendanceIds: string[] = [];

  beforeAll(async () => {
    fixtures = await createFixtures();
    teacherA = await signInAs(fixtures.teacherA.email, fixtures.password);
    teacherB = await signInAs(fixtures.teacherB.email, fixtures.password);
    parentA1 = await signInAs(fixtures.parentA1.email, fixtures.password);

    await admin
      .from("classes")
      .update({ billing_type: "per_lesson", lesson_rate: 20 })
      .eq("id", fixtures.classA.id);
  }, 30000);

  afterEach(async () => {
    if (createdAttendanceIds.length > 0) {
      await admin
        .from("attendance_records")
        .delete()
        .in("id", createdAttendanceIds);
      createdAttendanceIds.length = 0;
    }
    await admin
      .from("family_balance_transactions")
      .delete()
      .in("family_id", [fixtures.familyA.id, fixtures.familyB.id]);
  });

  afterAll(async () => {
    await admin.from("attendance_records").delete().in("id", createdAttendanceIds);
    await admin
      .from("family_balance_transactions")
      .delete()
      .in("family_id", [fixtures.familyA.id, fixtures.familyB.id]);
    await cleanupFixtures(fixtures);
  }, 30000);

  async function familyBalance(familyId: string): Promise<number> {
    const { data } = await admin
      .from("families")
      .select("balance")
      .eq("id", familyId)
      .single();
    return Number(data?.balance ?? NaN);
  }

  async function markAttendance(
    values: {
      classId: string;
      studentId: string;
      teacherId: string;
      date: string;
      status: string;
      className?: string;
    },
    client: typeof teacherA = teacherA,
  ) {
    const { data, error } = await client
      .from("attendance_records")
      .upsert(
        {
          teacher_id: values.teacherId,
          class_id: values.classId,
          class_name: values.className ?? "RLS Test Class A",
          student_id: values.studentId,
          attendance_date: values.date,
          status: values.status,
        },
        { onConflict: "teacher_id,class_id,student_id,attendance_date" },
      )
      .select("id")
      .single();
    if (data) createdAttendanceIds.push(data.id as string);
    return { data, error };
  }

  async function lessonChargeFor(attendanceRecordId: string) {
    const { data } = await admin
      .from("family_balance_transactions")
      .select("id, family_id, amount, type, source, period, attendance_record_id")
      .eq("attendance_record_id", attendanceRecordId)
      .maybeSingle();
    return data;
  }

  describe("posting and removing charges", () => {
    it("posts a lesson_charge for the full rate when marked present", async () => {
      const before = await familyBalance(fixtures.familyA.id);
      const { data: record, error } = await markAttendance({
        classId: fixtures.classA.id,
        studentId: fixtures.studentA.id,
        teacherId: fixtures.teacherA.id,
        date: "2026-09-08",
        status: "present",
      });
      expect(error).toBeNull();

      const charge = await lessonChargeFor(record!.id);
      expect(charge?.type).toBe("lesson_charge");
      expect(charge?.source).toBe("attendance");
      expect(charge?.family_id).toBe(fixtures.familyA.id);
      expect(Number(charge?.amount)).toBe(20);
      expect(charge?.period).toBe("2026-09-01");

      expect(await familyBalance(fixtures.familyA.id)).toBe(before + 20);
    });

    it("charges the full rate for late", async () => {
      const before = await familyBalance(fixtures.familyA.id);
      const { data: record } = await markAttendance({
        classId: fixtures.classA.id,
        studentId: fixtures.studentA.id,
        teacherId: fixtures.teacherA.id,
        date: "2026-09-09",
        status: "late",
      });
      const charge = await lessonChargeFor(record!.id);
      expect(Number(charge?.amount)).toBe(20);
      expect(await familyBalance(fixtures.familyA.id)).toBe(before + 20);
    });

    it("charges half the rate for a 1+1 split, exact to the cent", async () => {
      await admin
        .from("classes")
        .update({ lesson_rate: 15.01 })
        .eq("id", fixtures.classA.id);

      const before = await familyBalance(fixtures.familyA.id);
      const { data: record } = await markAttendance({
        classId: fixtures.classA.id,
        studentId: fixtures.studentA.id,
        teacherId: fixtures.teacherA.id,
        date: "2026-09-10",
        status: "split",
      });
      const charge = await lessonChargeFor(record!.id);
      expect(Number(charge?.amount)).toBe(7.51);
      expect(await familyBalance(fixtures.familyA.id)).toBe(before + 7.51);

      await admin
        .from("classes")
        .update({ lesson_rate: 20 })
        .eq("id", fixtures.classA.id);
    });

    it("posts nothing for a no-show marked absent", async () => {
      const before = await familyBalance(fixtures.familyA.id);
      const { data: record } = await markAttendance({
        classId: fixtures.classA.id,
        studentId: fixtures.studentA.id,
        teacherId: fixtures.teacherA.id,
        date: "2026-09-11",
        status: "absent",
      });
      const charge = await lessonChargeFor(record!.id);
      expect(charge).toBeNull();
      expect(await familyBalance(fixtures.familyA.id)).toBe(before);
    });

    it("removes the charge when a marked lesson flips to absent, then reposts on flipping back", async () => {
      const before = await familyBalance(fixtures.familyA.id);
      const { data: record } = await markAttendance({
        classId: fixtures.classA.id,
        studentId: fixtures.studentA.id,
        teacherId: fixtures.teacherA.id,
        date: "2026-09-12",
        status: "present",
      });
      expect(await familyBalance(fixtures.familyA.id)).toBe(before + 20);

      await markAttendance({
        classId: fixtures.classA.id,
        studentId: fixtures.studentA.id,
        teacherId: fixtures.teacherA.id,
        date: "2026-09-12",
        status: "absent",
      });
      expect(await lessonChargeFor(record!.id)).toBeNull();
      expect(await familyBalance(fixtures.familyA.id)).toBe(before);

      await markAttendance({
        classId: fixtures.classA.id,
        studentId: fixtures.studentA.id,
        teacherId: fixtures.teacherA.id,
        date: "2026-09-12",
        status: "present",
      });
      const { data: rows } = await admin
        .from("family_balance_transactions")
        .select("id")
        .eq("attendance_record_id", record!.id);
      expect(rows).toHaveLength(1);
      expect(await familyBalance(fixtures.familyA.id)).toBe(before + 20);
    });

    it("clearing the attendance mark entirely cascades the charge away", async () => {
      const before = await familyBalance(fixtures.familyA.id);
      const { data: record } = await markAttendance({
        classId: fixtures.classA.id,
        studentId: fixtures.studentA.id,
        teacherId: fixtures.teacherA.id,
        date: "2026-09-13",
        status: "present",
      });
      expect(await familyBalance(fixtures.familyA.id)).toBe(before + 20);

      await teacherA
        .from("attendance_records")
        .delete()
        .eq("id", record!.id);
      // Deleted by the app, not by our afterEach cleanup - drop it so
      // afterEach doesn't try to delete it again.
      createdAttendanceIds.splice(createdAttendanceIds.indexOf(record!.id), 1);

      expect(await lessonChargeFor(record!.id)).toBeNull();
      expect(await familyBalance(fixtures.familyA.id)).toBe(before);
    });
  });

  describe("future-only repricing", () => {
    it("does not reprice a posted charge when the rate changes and the same status is re-saved", async () => {
      const before = await familyBalance(fixtures.familyA.id);
      const { data: record } = await markAttendance({
        classId: fixtures.classA.id,
        studentId: fixtures.studentA.id,
        teacherId: fixtures.teacherA.id,
        date: "2026-09-14",
        status: "present",
      });
      expect(Number((await lessonChargeFor(record!.id))?.amount)).toBe(20);

      await admin
        .from("classes")
        .update({ lesson_rate: 30 })
        .eq("id", fixtures.classA.id);

      // Re-saving the identical status is exactly what a re-clicked
      // "Present" button (or PostgREST's upsert re-issuing the same row)
      // produces - the trigger's no-op guard must leave the old charge alone.
      await markAttendance({
        classId: fixtures.classA.id,
        studentId: fixtures.studentA.id,
        teacherId: fixtures.teacherA.id,
        date: "2026-09-14",
        status: "present",
      });
      expect(Number((await lessonChargeFor(record!.id))?.amount)).toBe(20);
      expect(await familyBalance(fixtures.familyA.id)).toBe(before + 20);

      // A genuinely new lesson at the new rate.
      const { data: record2 } = await markAttendance({
        classId: fixtures.classA.id,
        studentId: fixtures.studentA.id,
        teacherId: fixtures.teacherA.id,
        date: "2026-09-15",
        status: "present",
      });
      expect(Number((await lessonChargeFor(record2!.id))?.amount)).toBe(30);

      await admin
        .from("classes")
        .update({ lesson_rate: 20 })
        .eq("id", fixtures.classA.id);
    });
  });

  describe("billing_type switches", () => {
    it("a class switched back to monthly stops charging for new marks, leaving old charges alone", async () => {
      const before = await familyBalance(fixtures.familyA.id);
      const { data: oldRecord } = await markAttendance({
        classId: fixtures.classA.id,
        studentId: fixtures.studentA.id,
        teacherId: fixtures.teacherA.id,
        date: "2026-09-16",
        status: "present",
      });
      expect(await familyBalance(fixtures.familyA.id)).toBe(before + 20);

      await admin
        .from("classes")
        .update({ billing_type: "monthly", lesson_rate: null })
        .eq("id", fixtures.classA.id);

      const { data: newRecord } = await markAttendance({
        classId: fixtures.classA.id,
        studentId: fixtures.studentA.id,
        teacherId: fixtures.teacherA.id,
        date: "2026-09-17",
        status: "present",
      });
      expect(await lessonChargeFor(newRecord!.id)).toBeNull();
      // The old charge survives the class's mode switch untouched.
      expect(await lessonChargeFor(oldRecord!.id)).not.toBeNull();
      expect(await familyBalance(fixtures.familyA.id)).toBe(before + 20);

      await admin
        .from("classes")
        .update({ billing_type: "per_lesson", lesson_rate: 20 })
        .eq("id", fixtures.classA.id);
    });

    it("a monthly-billed class never posts a charge on any attendance mark", async () => {
      await admin
        .from("student_class_assignments")
        .insert({ student_id: fixtures.studentB.id, class_id: fixtures.classB.id });

      const before = await familyBalance(fixtures.familyB.id);
      const { data: record } = await markAttendance(
        {
          classId: fixtures.classB.id,
          studentId: fixtures.studentB.id,
          teacherId: fixtures.teacherB.id,
          date: "2026-09-08",
          status: "present",
          className: "RLS Test Class B",
        },
        teacherB,
      );

      expect(await lessonChargeFor(record!.id)).toBeNull();
      expect(await familyBalance(fixtures.familyB.id)).toBe(before);
    });
  });

  describe("coexistence with the monthly charge run", () => {
    it("a per-lesson charge and a monthly charge sum correctly in the same family", async () => {
      await admin
        .from("students")
        .update({ tuition_amount: 100 })
        .eq("id", fixtures.studentA.id);

      const before = await familyBalance(fixtures.familyA.id);
      await markAttendance({
        classId: fixtures.classA.id,
        studentId: fixtures.studentA.id,
        teacherId: fixtures.teacherA.id,
        date: "2026-09-18",
        status: "present",
      });

      const { error } = await admin.rpc("post_monthly_family_charges", {
        p_period: "2026-09-01",
        p_source: "manual",
      });
      expect(error).toBeNull();

      const after = await familyBalance(fixtures.familyA.id);
      expect(after).toBeCloseTo(before + 20 + 100, 2);

      const { data: recomputed } = await admin.rpc("recompute_family_balance", {
        p_family_id: fixtures.familyA.id,
      });
      expect(Number(recomputed)).toBeCloseTo(after, 2);

      await admin
        .from("family_balance_transactions")
        .delete()
        .eq("family_id", fixtures.familyA.id)
        .eq("type", "monthly_charge")
        .eq("period", "2026-09-01");
      await admin
        .from("students")
        .update({ tuition_amount: null })
        .eq("id", fixtures.studentA.id);
    });
  });

  describe("CHECK constraints", () => {
    it("rejects a lesson_charge with a null attendance_record_id", async () => {
      const { error } = await admin.from("family_balance_transactions").insert({
        family_id: fixtures.familyA.id,
        type: "lesson_charge",
        amount: 20,
        description: "orphan lesson charge",
      });
      expect(error).not.toBeNull();
    });

    it("rejects a class set to per_lesson with no lesson_rate", async () => {
      const { error } = await admin
        .from("classes")
        .update({ billing_type: "per_lesson", lesson_rate: null })
        .eq("id", fixtures.classA.id);
      expect(error).not.toBeNull();

      // Restore - the failed update above must not have partially applied.
      await admin
        .from("classes")
        .update({ billing_type: "per_lesson", lesson_rate: 20 })
        .eq("id", fixtures.classA.id);
    });

    it("rejects a negative lesson_rate", async () => {
      const { error } = await admin
        .from("classes")
        .update({ lesson_rate: -5 })
        .eq("id", fixtures.classA.id);
      expect(error).not.toBeNull();
    });
  });

  describe("authorization", () => {
    it("hides family A's lesson charges from teacher B", async () => {
      const { data: record } = await markAttendance({
        classId: fixtures.classA.id,
        studentId: fixtures.studentA.id,
        teacherId: fixtures.teacherA.id,
        date: "2026-09-19",
        status: "present",
      });
      const charge = await lessonChargeFor(record!.id);

      const { data } = await teacherB
        .from("family_balance_transactions")
        .select("id")
        .eq("id", charge!.id);
      expect(data ?? []).toHaveLength(0);
    });

    it("never charges another teacher's family when attendance references their class/student (cross-tenant trigger guard)", async () => {
      // attendance_records RLS only checks the row's own teacher_id
      // (using (teacher_id = auth.uid())), never that class_id/student_id
      // actually belong to that teacher - a pre-existing gap, harmless on
      // its own, that this test documents rather than closes. What must
      // hold is the trigger: post_lesson_charge_row() has to refuse to
      // resolve teacher A's per-lesson class/family under a row teacher B
      // wrote naming them, even though the insert itself is allowed.
      const before = await familyBalance(fixtures.familyA.id);

      const { data: record, error } = await markAttendance(
        {
          classId: fixtures.classA.id, // belongs to teacher A
          studentId: fixtures.studentA.id, // belongs to teacher A
          teacherId: fixtures.teacherB.id, // the row's own teacher_id
          date: "2026-09-22",
          status: "present",
        },
        teacherB,
      );

      expect(error).toBeNull();
      expect(await lessonChargeFor(record!.id)).toBeNull();
      expect(await familyBalance(fixtures.familyA.id)).toBe(before);
    });

    it("lets parent A1 read the lesson charge but not insert one directly", async () => {
      const { data: record } = await markAttendance({
        classId: fixtures.classA.id,
        studentId: fixtures.studentA.id,
        teacherId: fixtures.teacherA.id,
        date: "2026-09-20",
        status: "present",
      });
      const charge = await lessonChargeFor(record!.id);

      const { data: readBack } = await parentA1
        .from("family_balance_transactions")
        .select("id")
        .eq("id", charge!.id);
      expect(readBack ?? []).toHaveLength(1);

      const { error } = await parentA1.from("family_balance_transactions").insert({
        family_id: fixtures.familyA.id,
        type: "lesson_charge",
        amount: 20,
        attendance_record_id: record!.id,
        description: "should be rejected",
      });
      expect(error).not.toBeNull();
    });
  });

  describe("the class-deletion regression guard", () => {
    it("deleting a class leaves its historical lesson charges and the family balance untouched", async () => {
      const before = await familyBalance(fixtures.familyA.id);
      const { data: record } = await markAttendance({
        classId: fixtures.classA.id,
        studentId: fixtures.studentA.id,
        teacherId: fixtures.teacherA.id,
        date: "2026-09-21",
        status: "present",
      });
      expect(await familyBalance(fixtures.familyA.id)).toBe(before + 20);

      // ON DELETE SET NULL on attendance_records.class_id - this must NOT
      // re-fire the AFTER ... OF status trigger and delete the charge.
      const { error } = await admin.from("classes").delete().eq("id", fixtures.classA.id);
      expect(error).toBeNull();

      const { data: survivingRecord } = await admin
        .from("attendance_records")
        .select("id, class_id, class_name")
        .eq("id", record!.id)
        .single();
      expect(survivingRecord?.class_id).toBeNull();
      expect(survivingRecord?.class_name).toBe("RLS Test Class A");

      expect(await lessonChargeFor(record!.id)).not.toBeNull();
      expect(await familyBalance(fixtures.familyA.id)).toBe(before + 20);
    });
  });
});

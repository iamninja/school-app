import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { signInAs, serviceClient } from "./helpers";
import { cleanupFixtures, createFixtures, type Fixtures } from "./fixtures";

const BUCKET = "quiz-images";

/**
 * The storage.objects policies added for quiz question images are the
 * first Storage RLS in this app - everything else so far is plain table
 * RLS. Worth its own real integration coverage rather than trusting the
 * SQL by inspection alone: a teacher's own-folder upload/read, that
 * another teacher can't write into or read someone else's folder before
 * any quiz_questions row references it, and that an assigned student can
 * read an image once a question actually references its path while an
 * unrelated student still can't.
 */
describe("RLS: quiz question images", () => {
  let fixtures: Fixtures;
  let teacherA: Awaited<ReturnType<typeof signInAs>>;
  let teacherB: Awaited<ReturnType<typeof signInAs>>;
  let studentA: Awaited<ReturnType<typeof signInAs>>;
  let studentB: Awaited<ReturnType<typeof signInAs>>;
  const uploadedPaths: string[] = [];

  beforeAll(async () => {
    fixtures = await createFixtures();
    teacherA = await signInAs(fixtures.teacherA.email, fixtures.password);
    teacherB = await signInAs(fixtures.teacherB.email, fixtures.password);

    const admin = serviceClient();
    const studentAAuth = await admin.auth.admin.createUser({
      email: "rls-student-a@example.test",
      password: fixtures.password,
      email_confirm: true,
    });
    const studentBAuth = await admin.auth.admin.createUser({
      email: "rls-student-b@example.test",
      password: fixtures.password,
      email_confirm: true,
    });
    await admin
      .from("students")
      .update({ user_id: studentAAuth.data.user!.id })
      .eq("id", fixtures.studentA.id);
    await admin
      .from("students")
      .update({ user_id: studentBAuth.data.user!.id })
      .eq("id", fixtures.studentB.id);

    studentA = await signInAs("rls-student-a@example.test", fixtures.password);
    studentB = await signInAs("rls-student-b@example.test", fixtures.password);
  }, 30000);

  afterEach(async () => {
    if (uploadedPaths.length > 0) {
      await serviceClient().storage.from(BUCKET).remove(uploadedPaths);
      uploadedPaths.length = 0;
    }
    await serviceClient()
      .from("quiz_questions")
      .update({ image_path: null })
      .eq("id", fixtures.questionA.id);
  });

  afterAll(async () => {
    const admin = serviceClient();
    await admin
      .from("students")
      .update({ user_id: null })
      .in("id", [fixtures.studentA.id, fixtures.studentB.id]);
    const { data: studentAUser } = await admin.auth.admin.listUsers();
    for (const user of studentAUser.users.filter((u) =>
      u.email?.startsWith("rls-student-"),
    )) {
      await admin.auth.admin.deleteUser(user.id);
    }
    await cleanupFixtures(fixtures);
  }, 30000);

  it("lets a teacher upload and read back an image in their own folder", async () => {
    const path = `${fixtures.teacherA.id}/own-folder-test.png`;
    uploadedPaths.push(path);

    const upload = await teacherA.storage
      .from(BUCKET)
      .upload(path, Buffer.from("fake-png-bytes"), {
        contentType: "image/png",
      });
    expect(upload.error).toBeNull();

    const download = await teacherA.storage.from(BUCKET).download(path);
    expect(download.error).toBeNull();
  });

  it("blocks a teacher from uploading into another teacher's folder", async () => {
    const path = `${fixtures.teacherA.id}/cross-teacher-test.png`;

    const upload = await teacherB.storage
      .from(BUCKET)
      .upload(path, Buffer.from("fake-png-bytes"), {
        contentType: "image/png",
      });
    expect(upload.error).not.toBeNull();
  });

  it("blocks a teacher from reading another teacher's not-yet-referenced upload", async () => {
    const path = `${fixtures.teacherA.id}/unreferenced-test.png`;
    uploadedPaths.push(path);
    await serviceClient()
      .storage.from(BUCKET)
      .upload(path, Buffer.from("fake-png-bytes"), {
        contentType: "image/png",
      });

    const download = await teacherB.storage.from(BUCKET).download(path);
    expect(download.error).not.toBeNull();
  });

  it("lets an assigned student read an image once a question references it, but not an unassigned student", async () => {
    const path = `${fixtures.teacherA.id}/question-image-test.png`;
    uploadedPaths.push(path);
    await serviceClient()
      .storage.from(BUCKET)
      .upload(path, Buffer.from("fake-png-bytes"), {
        contentType: "image/png",
      });
    await serviceClient()
      .from("quiz_questions")
      .update({ image_path: path })
      .eq("id", fixtures.questionA.id);

    const assignedDownload = await studentA.storage.from(BUCKET).download(path);
    expect(assignedDownload.error).toBeNull();

    const unassignedDownload = await studentB.storage
      .from(BUCKET)
      .download(path);
    expect(unassignedDownload.error).not.toBeNull();
  });
});

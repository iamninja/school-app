import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signInAs, serviceClient } from "./helpers";
import { cleanupFixtures, createFixtures, type Fixtures } from "./fixtures";

/**
 * Storage rules for the two file buckets other than quiz images
 * (tests/rls/quiz-images.test.ts):
 * - class-files (private, PDFs; 20261114132857_class-files.sql): the
 *   teacher writes under their own folder; a student or parent reads a
 *   file only once a class_files row of their class points at it;
 * - practice-images (public; 20261115125145_practice-pool.sql): anyone
 *   can view, only the teacher writes, under their own folder.
 *
 * Needs the storage service in the local stack (npx supabase start runs it).
 */
const PDF = Buffer.from("%PDF-1.4\n%rls-test\n");
const PNG = Buffer.from("89504e470d0a1a0a", "hex");

describe("RLS: class files and practice images in storage", () => {
  let fixtures: Fixtures;
  let teacherA: Awaited<ReturnType<typeof signInAs>>;
  let teacherB: Awaited<ReturnType<typeof signInAs>>;
  let parentA1: Awaited<ReturnType<typeof signInAs>>;
  let parentB1: Awaited<ReturnType<typeof signInAs>>;
  let studentA: Awaited<ReturnType<typeof signInAs>>;
  let studentB: Awaited<ReturnType<typeof signInAs>>;
  let anon: Awaited<ReturnType<typeof signInAs>>;
  let classFilePath: string;
  let practiceImagePath: string;
  let classFileRowId: string | null = null;

  const downloads = async (client: typeof studentA, bucket: string, path: string) =>
    (await client.storage.from(bucket).download(path)).error === null;

  beforeAll(async () => {
    fixtures = await createFixtures();
    const admin = serviceClient();
    for (const [studentId, email] of [
      [fixtures.studentA.id, "rls-storage-student-a@example.test"],
      [fixtures.studentB.id, "rls-storage-student-b@example.test"],
    ]) {
      const { data } = await admin.auth.admin.createUser({ email, password: fixtures.password, email_confirm: true });
      await admin.from("students").update({ user_id: data.user!.id }).eq("id", studentId);
    }
    await admin.from("student_class_assignments").insert({ student_id: fixtures.studentB.id, class_id: fixtures.classB.id });

    teacherA = await signInAs(fixtures.teacherA.email, fixtures.password);
    teacherB = await signInAs(fixtures.teacherB.email, fixtures.password);
    parentA1 = await signInAs(fixtures.parentA1.email, fixtures.password);
    parentB1 = await signInAs(fixtures.parentB1.email, fixtures.password);
    studentA = await signInAs("rls-storage-student-a@example.test", fixtures.password);
    studentB = await signInAs("rls-storage-student-b@example.test", fixtures.password);
    anon = createClient(process.env.LOCAL_SUPABASE_URL!, process.env.LOCAL_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    }) as typeof studentA;

    classFilePath = `${fixtures.teacherA.id}/rls-notes.pdf`;
    practiceImagePath = `${fixtures.teacherA.id}/rls-graph.png`;
  }, 60000);

  afterAll(async () => {
    const admin = serviceClient();
    if (classFileRowId) await admin.from("class_files").delete().eq("id", classFileRowId);
    await admin.storage.from("class-files").remove([classFilePath, `${fixtures.teacherB.id}/rls-planted.pdf`, `${fixtures.teacherA.id}/rls-by-student.pdf`]);
    await admin.storage.from("practice-images").remove([practiceImagePath, `${fixtures.teacherA.id}/rls-by-student.png`]);
    await admin.from("student_class_assignments").delete().eq("student_id", fixtures.studentB.id);
    await admin.from("students").update({ user_id: null }).in("id", [fixtures.studentA.id, fixtures.studentB.id]);
    const { data: users } = await admin.auth.admin.listUsers();
    for (const user of users.users.filter((u) => u.email?.startsWith("rls-storage-"))) {
      await admin.auth.admin.deleteUser(user.id);
    }
    await cleanupFixtures(fixtures);
  }, 60000);

  describe("class files", () => {
    it("lets the teacher upload into their own folder, not another teacher's", async () => {
      const own = await teacherA.storage.from("class-files").upload(classFilePath, PDF, { contentType: "application/pdf" });
      expect(own.error).toBeNull();
      const planted = await teacherA.storage
        .from("class-files")
        .upload(`${fixtures.teacherB.id}/rls-planted.pdf`, PDF, { contentType: "application/pdf" });
      expect(planted.error).not.toBeNull();
    });

    it("doesn't let students, parents or guests upload", async () => {
      for (const client of [studentA, parentA1, anon]) {
        const { error } = await client.storage
          .from("class-files")
          .upload(`${fixtures.teacherA.id}/rls-by-student.pdf`, PDF, { contentType: "application/pdf" });
        expect(error).not.toBeNull();
      }
    });

    it("keeps an uploaded file closed until it's shared with a class", async () => {
      expect(await downloads(teacherA, "class-files", classFilePath)).toBe(true);
      for (const client of [studentA, parentA1, teacherB, anon]) {
        expect(await downloads(client, "class-files", classFilePath)).toBe(false);
      }
    });

    it("opens a shared file to that class's students and parents only", async () => {
      const { data, error } = await serviceClient()
        .from("class_files")
        .insert({ teacher_id: fixtures.teacherA.id, class_id: fixtures.classA.id, kind: "file", title: "Notes", storage_path: classFilePath, file_name: "notes.pdf", size_bytes: PDF.length })
        .select("id")
        .single();
      if (error) throw error;
      classFileRowId = data.id;

      expect(await downloads(studentA, "class-files", classFilePath)).toBe(true);
      expect(await downloads(parentA1, "class-files", classFilePath)).toBe(true);
      for (const client of [studentB, parentB1, teacherB, anon]) {
        expect(await downloads(client, "class-files", classFilePath)).toBe(false);
      }

      // The portal's download link (app/api/class-files/[id]/route.ts) is a
      // signed URL made with the viewer's own session.
      expect((await studentA.storage.from("class-files").createSignedUrl(classFilePath, 60)).error).toBeNull();
      expect((await studentB.storage.from("class-files").createSignedUrl(classFilePath, 60)).error).not.toBeNull();
    });

    it("doesn't let a student or parent replace or delete a shared file", async () => {
      for (const client of [studentA, parentA1]) {
        await client.storage.from("class-files").upload(classFilePath, Buffer.from("%PDF-1.4\nreplaced\n"), { contentType: "application/pdf", upsert: true });
        await client.storage.from("class-files").remove([classFilePath]);
      }
      const { data } = await serviceClient().storage.from("class-files").download(classFilePath);
      expect(Buffer.from(await data!.arrayBuffer()).equals(PDF)).toBe(true);
    });
  });

  describe("practice images", () => {
    it("lets the teacher upload into their own folder", async () => {
      const { error } = await teacherA.storage.from("practice-images").upload(practiceImagePath, PNG, { contentType: "image/png" });
      expect(error).toBeNull();
    });

    it("are public to view, guests included", async () => {
      const url = anon.storage.from("practice-images").getPublicUrl(practiceImagePath).data.publicUrl;
      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer()).equals(PNG)).toBe(true);
    });

    it("can't be uploaded, replaced or deleted by anyone else", async () => {
      for (const client of [studentA, parentA1, teacherB, anon]) {
        const { error } = await client.storage
          .from("practice-images")
          .upload(`${fixtures.teacherA.id}/rls-by-student.png`, PNG, { contentType: "image/png" });
        expect(error).not.toBeNull();
        await client.storage.from("practice-images").upload(practiceImagePath, Buffer.from("not an image"), { contentType: "image/png", upsert: true });
        await client.storage.from("practice-images").remove([practiceImagePath]);
      }
      const { data } = await serviceClient().storage.from("practice-images").download(practiceImagePath);
      expect(Buffer.from(await data!.arrayBuffer()).equals(PNG)).toBe(true);
    });
  });
});

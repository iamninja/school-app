export function QuizQuestionImage({
  imageUrl,
  alt = "Question image",
}: {
  imageUrl?: string | null;
  alt?: string;
}) {
  if (!imageUrl) {
    return null;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL, not a static asset next/image can optimize
    <img
      src={imageUrl}
      alt={alt}
      className="max-h-64 max-w-full rounded-md border object-contain"
    />
  );
}

export function AnnouncementBar({ text }: { text: string | undefined }) {
  if (!text?.trim()) return null;
  return (
    <div className="bg-primary text-primary-contrast text-center px-4 py-2" role="region" aria-label="Announcement">
      <p className="eyebrow text-[10.5px] sm:text-[11px] tracking-[.16em]">{text}</p>
    </div>
  );
}

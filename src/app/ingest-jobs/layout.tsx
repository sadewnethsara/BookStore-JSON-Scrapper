import { IngestJobsScrollFix } from "./scroll-fix";

export default function IngestJobsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <IngestJobsScrollFix />
      {children}
    </>
  );
}

export const metadata = { title: "Templates — OpenGong Lite" };

export default function TemplatesPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 md:px-10">
      <h1 className="text-3xl font-semibold tracking-tight text-fg">
        Meeting templates
      </h1>
      <div className="card mt-8 px-6 py-12 text-center">
        <p className="text-[15px] font-semibold text-fg">
          Template library arriving here
        </p>
        <p className="mt-1 text-sm text-fg-muted">
          Eight routed follow-up email templates are already live in the
          pipeline — every analyzed call picks the best match automatically.
          The browsing and customization UI lands here next.
        </p>
      </div>
    </div>
  );
}

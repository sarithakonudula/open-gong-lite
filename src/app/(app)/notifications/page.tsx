export const metadata = { title: "Notifications — OpenGong Lite" };

export default function NotificationsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 md:px-10">
      <h1 className="text-3xl font-semibold tracking-tight text-fg">
        Notifications
      </h1>
      <div className="card mt-8 px-6 py-12 text-center">
        <p className="text-[15px] font-semibold text-fg">No notifications yet</p>
        <p className="mt-1 text-sm text-fg-muted">
          Recording, deal-risk, and coaching events will appear here.
        </p>
      </div>
    </div>
  );
}

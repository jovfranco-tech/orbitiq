// Unregister any lingering service workers and clear caches so users always
// get a fresh network load. Runs once on page load before the React bundle.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function (registrations) {
    if (registrations.length > 0) {
      registrations.forEach(function (registration) {
        registration.unregister();
      });
      setTimeout(function () { window.location.reload(true); }, 200);
    }
  });
}
if ('caches' in window) {
  caches.keys().then(function (names) {
    names.forEach(function (name) { caches.delete(name); });
  });
}

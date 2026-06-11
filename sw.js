// Saitex Laundry Tracker — service worker
// Required for Web Push to work as a real (closed-app) notification.
// Must be served from the SAME origin as index.html, at the site root
// (e.g. https://yoursite.com/sw.js), so its scope covers the whole app.

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

// Incoming push message → show a system notification
self.addEventListener('push', function(event) {
  var data = { title: 'Saitex Laundry', body: '' };
  if (event.data) {
    try { data = event.data.json(); }
    catch (e) { data.body = event.data.text(); }
  }

  var options = {
    body: data.body || '',
    icon: data.icon || 'icon-192.png',
    badge: data.badge || 'icon-192.png',
    tag: data.tag || 'saitex',
    vibrate: [200, 80, 200],
    data: { url: data.url || '/' }
  };

  event.waitUntil(self.registration.showNotification(data.title || 'Saitex Laundry', options));
});

// Tapping the notification focuses an existing tab or opens a new one
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

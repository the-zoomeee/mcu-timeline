const CACHE_NAME = 'mcu-ledger-v1';
const ASSETS = ['./index.html', './style.css', './app.js', './data.json', './upcoming.json', './posters/avengers-doomsday.png', './posters/avengers-secret-wars.png'];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE_NAME).then(function(cache){ return cache.addAll(ASSETS); }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
    })
  );
});

self.addEventListener('fetch', function(e){
  e.respondWith(
    caches.match(e.request).then(function(cached){ return cached || fetch(e.request); })
  );
});
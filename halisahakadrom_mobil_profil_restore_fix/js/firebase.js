const firebaseConfig = {
    apiKey: "AIzaSyCbMPp-kGJK4bmHpNsnzHhtxzYSOSfOc6g",
    authDomain: "halisaha-d4ba0.firebaseapp.com",
    projectId: "halisaha-d4ba0",
    storageBucket: "halisaha-d4ba0.appspot.com",
    messagingSenderId: "1046842011530",
    appId: "1:1046842011530:web:c885d3b9de803343f12273"
};

firebase.initializeApp(firebaseConfig);

// Auth persistence: tarayıcı/sekme kapatılınca Firebase oturumu biter.
// Aynı sekmede yenileme sırasında oturum korunur.
window.__authPersistenceReady = firebase.auth().setPersistence(firebase.auth.Auth.Persistence.SESSION)
    .catch((e) => console.warn("Auth persistence ayarlanamadı:", e));

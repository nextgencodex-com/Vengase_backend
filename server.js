const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert(require("./serviceAccountKey.json")),
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
});


const bucket = admin.storage().bucket();

console.log("✅ Firebase connected. Bucket name:", bucket.name);

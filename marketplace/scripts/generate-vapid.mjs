import webpush from "web-push";
const keys = webpush.generateVAPIDKeys();
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log("# Store these in your secret manager, not Git. Set VAPID_SUBJECT to your security contact.");

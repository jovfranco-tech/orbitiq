import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

interface FirebaseClient {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

const requiredConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const optionalConfig = {
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};

let client: FirebaseClient | null = null;

export function isFirebaseConfigured(): boolean {
  return Object.values(requiredConfig).every((value) => typeof value === 'string' && value.length > 0);
}

export function getFirebaseClient(): FirebaseClient | null {
  if (!isFirebaseConfigured()) return null;
  if (client) return client;

  const app = getApps().length
    ? getApp()
    : initializeApp({
        ...requiredConfig,
        ...optionalConfig,
      });

  client = {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
  };

  return client;
}

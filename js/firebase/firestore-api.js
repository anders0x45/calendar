/**
 * Firestore plumbing surface for js/data/* modules: named re-exports of
 * the modular SDK functions the data layer needs. No policy here — the
 * only place the gstatic SDK is imported lives in js/firebase/.
 */

export {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

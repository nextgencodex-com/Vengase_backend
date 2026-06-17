/**
 * Admin Reset Script
 * Removes ALL Firebase Auth users, then creates admin@vengase.com with password VEngase3131
 * and sets admin custom claims.
 *
 * Run from: Vengase_backend/
 *   node scripts/resetAdmin.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('../config/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const auth = admin.auth();

async function deleteAllUsers() {
  console.log('\n🗑️  Fetching all users to delete...');
  let pageToken;
  let totalDeleted = 0;

  do {
    const listResult = await auth.listUsers(1000, pageToken);
    const uids = listResult.users.map(u => u.uid);

    if (uids.length > 0) {
      console.log(`   Found ${uids.length} user(s): ${listResult.users.map(u => u.email).join(', ')}`);
      await auth.deleteUsers(uids);
      totalDeleted += uids.length;
      console.log(`   ✅ Deleted ${uids.length} user(s).`);
    }

    pageToken = listResult.pageToken;
  } while (pageToken);

  console.log(`\n   Total deleted: ${totalDeleted} user(s).`);
}

async function createAdminUser() {
  const email = 'admin@vengase.com';
  const password = 'VEngase3131';

  console.log(`\n👤 Creating new admin user: ${email}`);
  const userRecord = await auth.createUser({
    email,
    password,
    displayName: 'Admin',
    emailVerified: true,
  });

  console.log(`   ✅ User created: ${userRecord.uid}`);

  console.log(`\n🔑 Setting admin custom claims...`);
  await auth.setCustomUserClaims(userRecord.uid, {
    admin: true,
    role: 'admin',
    grantedAt: new Date().toISOString(),
  });

  console.log(`   ✅ Admin claims set.`);
  return userRecord;
}

async function main() {
  try {
    await deleteAllUsers();
    const admin = await createAdminUser();

    console.log('\n✅ Done! Admin account ready:');
    console.log(`   Email   : admin@vengase.com`);
    console.log(`   Password: VEngase3131`);
    console.log(`   UID     : ${admin.uid}`);
    console.log(`   Claims  : { admin: true, role: "admin" }\n`);
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();

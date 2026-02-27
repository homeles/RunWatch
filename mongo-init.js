// mongo-init.js — runs once on first container startup (docker-entrypoint-initdb.d)
// Creates a least-privilege application user with readWrite on the 'runwatch' database only.
// The root credentials are only used here during init; the app connects as appUser.

const appUsername = process.env.MONGO_APP_USERNAME;
const appPassword = process.env.MONGO_APP_PASSWORD;

if (!appUsername || !appPassword) {
  throw new Error('MONGO_APP_USERNAME and MONGO_APP_PASSWORD must be set');
}

db = db.getSiblingDB('runwatch');

// Use updateUser if it already exists, otherwise createUser.
// This makes the init script idempotent (safe to re-run).
try {
  db.createUser({
    user: appUsername,
    pwd: appPassword,
    roles: [
      { role: 'readWrite', db: 'runwatch' }
    ]
  });
  print(`Created app user '${appUsername}' with readWrite on 'runwatch'`);
} catch (e) {
  if (e.codeName === 'DuplicateKey' || (e.message && e.message.includes('already exists'))) {
    db.updateUser(appUsername, {
      pwd: appPassword,
      roles: [
        { role: 'readWrite', db: 'runwatch' }
      ]
    });
    print(`Updated existing app user '${appUsername}'`);
  } else {
    throw e;
  }
}

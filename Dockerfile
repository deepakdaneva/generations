# Local development image: Angular dev server + Firebase Emulator Suite in one
# container. Not for production; deployed builds are served by Firebase Hosting.
FROM node:24-trixie-slim

# The Firebase emulators need a Java 21+ runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openjdk-21-jre-headless \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json .npmrc ./
# Pre-download the emulator binaries so container starts are fast and offline-safe.
RUN npm ci --no-audit --no-fund \
  && npx firebase setup:emulators:firestore \
  && npx firebase setup:emulators:ui

COPY . .

# Inside the container, servers must listen on all interfaces to be reachable
# through the published ports.
# ponytail: patched at build time so firebase.json keeps safe 127.0.0.1 defaults for host runs.
RUN sed -i 's/"127.0.0.1"/"0.0.0.0"/g' firebase.json

# The emulators replace the export folder on exit, so it must sit below the
# mounted volume (/data), not be the mount point itself.
VOLUME /data

EXPOSE 4200 4000 9099 8080 9150 4400 4500

CMD ["./node_modules/.bin/firebase", "emulators:exec", "npm start -- --host 0.0.0.0", "--only", "auth,firestore", "--ui", "--import=/data/export", "--export-on-exit=/data/export"]

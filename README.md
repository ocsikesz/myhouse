# CasaMea

Aplicație privată (Android, Expo) pentru administrarea utilităților casei.

## Stadiu

| Pas | Ce face | Stare |
| --- | --- | --- |
| 1 | Proiect Expo, SQLite cu migrații, structura de ecrane | ✅ |
| 2 | Apă rece (Deservcom): 2 contoare, consum, trimitere pe WhatsApp | ⏳ |
| 3 | Asociația de proprietari: suma lunară, plătit / neplătit | ⏳ |
| 4 | E.ON Myline: login, fereastră autocitire, ultimul index, trimitere | ⏳ |
| 5 | Electrica (MyElectrica): la fel | ⏳ |
| 6 | Verificare în fundal, notificări, panou cu grafice | ⏳ |
| 7 | Opțional: detectarea mesajului WhatsApp de la reprezentantul de apă | ⏳ |

## Structură

```
src/
  app/            rute Expo Router (fiecare fișier = ecran)
    (tabs)/       Acasă, Utilități, Istoric, Setări
  components/     componente UI comune
  db/             schema SQLite, migrații (PRAGMA user_version), repository
  lib/            formatare RO, calcul consum, temă, hook-uri
```

## Comenzi

```bash
npm install
npx expo start            # dev server
npm run typecheck         # tsc --noEmit
npx expo run:android      # development build (expo-sqlite are cod nativ, nu merge în Expo Go vechi)
```

## Note

- Schema bazei de date: `src/db/migrations.ts`. Nu modifica o migrație deja livrată — adaugă una nouă.
- `react-dom` e fixat la aceeași versiune ca `react` (19.3.0) ca să nu apară conflict de peer dependency la `npx expo install`.

## APK automat (GitHub Actions)

La fiecare push pe `main`, workflow-ul `.github/workflows/android-apk.yml` construiește un APK semnat și îl publică în **Releases** (`CasaMea-<build>.apk`). Numărul rulării devine `versionCode`, deci fiecare APK nou se instalează peste cel vechi.

Secrete necesare în repo (Settings → Secrets and variables → Actions):
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
Keystore-ul trebuie păstrat — fără el nu mai poți instala update-uri peste aplicația existentă.

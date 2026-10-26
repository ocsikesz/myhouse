# CasaMea

Aplicație privată (Android, Expo) pentru administrarea utilităților casei.

## Ce face

| Zonă | Funcții |
| --- | --- |
| Apă rece (Deservcom) | index bucătărie + baie, poză contor, validare, consum, mesaj WhatsApp precompletat către reprezentant |
| Asociația | suma lunară, scadență, plătit / neplătit, total 12 luni |
| E.ON Myline | login (cu 2FA), contracte gaz/curent (inclusiv DUO), index facturat, fereastră autocitire, trimitere index |
| MyElectrica | login, locuri de consum, index, fereastră PAC, trimitere index |
| Reminder-e | verificare în fundal la ~4 ore, notificare la deschiderea ferestrei și în ultima zi, apă, asociație |
| Istoric | grafice de consum lunar pe 12 luni |

API-urile E.ON și Electrica sunt neoficiale (cele folosite de aplicațiile mobile), portate din
[cnecrea/eonromania](https://github.com/cnecrea/eonromania) și [cnecrea/myelectrica](https://github.com/cnecrea/myelectrica) (MIT).
Dacă furnizorii le schimbă, integrarea trebuie actualizată.

## Structură

```
src/
  app/            rute Expo Router (fiecare fișier = ecran)
    (tabs)/       Acasă, Utilități, Istoric, Setări
  components/     componente UI comune
  db/             schema SQLite, migrații (PRAGMA user_version), repository
  providers/      clienți API E.ON / Electrica, credențiale (SecureStore), sincronizare
  background/     task de fundal: sincronizare + notificări
  lib/            formatare RO, consum, sarcini/reminder-e, notificări, temă
tests/            teste pentru logica pură și clienții API (fetch simulat)
```

## Comenzi

```bash
npm install
npx expo start            # dev server
npm run typecheck         # tsc --noEmit
npm test                  # teste logică + clienți API
npx expo run:android      # development build (expo-sqlite are cod nativ, nu merge în Expo Go vechi)
```

## Note

- Schema bazei de date: `src/db/migrations.ts`. Nu modifica o migrație deja livrată — adaugă una nouă.
- `react-dom` e fixat la aceeași versiune ca `react` (19.3.0) ca să nu apară conflict de peer dependency la `npx expo install`.

## APK automat (GitHub Actions)

La fiecare push pe `main`, workflow-ul `.github/workflows/android-apk.yml` construiește un APK semnat și îl publică în **Releases** (`CasaMea-<build>.apk`). Numărul rulării devine `versionCode`, deci fiecare APK nou se instalează peste cel vechi.

Semnare: keystore-ul de release e în `signing/` (repo privat, aplicație de uz personal). Opțional, poți muta cheia în secretele repo-ului (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) — workflow-ul le folosește cu prioritate.
Keystore-ul trebuie păstrat — fără el nu mai poți instala update-uri peste aplicația existentă.

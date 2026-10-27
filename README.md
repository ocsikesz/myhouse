# Indexa

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

## Familie și backup (Supabase)

Toată familia folosește același cont (email + parolă). Citirile, pozele, asociația, setările comune și
conturile E.ON / Electrica (criptate cu parola familiei, AES-256-GCM) se sincronizează prin Supabase.
Doar un telefon se loghează la furnizori; celelalte primesc facturile, consumul și starea indexului din cloud.

Configurare, o singură dată:

1. [supabase.com](https://supabase.com) → **New project** (planul gratuit e suficient). Regiunea: Frankfurt.
2. **SQL Editor → New query** → lipește conținutul `supabase/schema.sql` → **Run**.
3. **Authentication → Users → Add user → Create new user**: emailul și parola familiei, bifat **Auto Confirm User**.
4. **Project Settings → API**: copiază *Project URL* și cheia *anon public*.
5. Adresa și cheia „anon” sunt în `app.config.ts` (proiectul „Brasov5b/51”). Pentru alt proiect, le schimbi acolo
   sau pui secretele `SUPABASE_URL` / `SUPABASE_ANON_KEY` în repo (au prioritate).
6. Pe fiecare telefon: **Setări → Familie și backup** → conectare cu contul familiei.

## Structură

```
src/
  app/            rute Expo Router (fiecare fișier = ecran)
    (tabs)/       Acasă, Utilități, Istoric, Setări
  components/     componente UI comune
  db/             schema SQLite, migrații (PRAGMA user_version), repository
  providers/      clienți API E.ON / Electrica, credențiale (SecureStore), sincronizare
  background/     task de fundal: sincronizare + notificări
  cloud/          sincronizare de familie (Supabase REST), criptarea parolelor furnizorilor
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

La fiecare push pe `main`, workflow-ul `.github/workflows/android-apk.yml` construiește un APK semnat și îl publică în **Releases** (`Indexa-<build>.apk`). Numărul rulării devine `versionCode`, deci fiecare APK nou se instalează peste cel vechi.

Semnare: keystore-ul de release e în `signing/` (repo privat, aplicație de uz personal). Opțional, poți muta cheia în secretele repo-ului (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) — workflow-ul le folosește cu prioritate.
Keystore-ul trebuie păstrat — fără el nu mai poți instala update-uri peste aplicația existentă.

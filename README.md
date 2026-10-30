# hkfree cloudmap

Webová aplikace pro dokumentaci páteřní sítě [hkfree.org](https://www.hkfree.org).
Nahrazuje ruční úpravy Dia diagramu v SVN a nahrávání PNG na wiki.

- `apps/api` – Fastify API, SQLite (Kysely, připraveno na MySQL), import z Dia
- `apps/web` – React + vlastní SVG renderer (d3-zoom), export SVG/PNG v prohlížeči
- `packages/shared` – sdílené Zod schéma a typy

## Vývoj

```sh
npm ci
npm run import:dia -- cesta/k/hkfree-cloud-map.dia   # naplní ./data/cloudmap.db
npm run dev:api                                       # API na :8080, bez přihlášení (DEV_MODE)
npm run dev:web                                       # web na :5173 (proxy /api)
npm test
npm run typecheck
```

API dokumentace (OpenAPI): `/api/v1/docs`. Hlavní endpointy:

- `GET /api/v1/me` – přihlášený uživatel

- `GET /api/v1/map[?revision=N]` – celá mapa, aktuální nebo po revizi N
- `POST /api/v1/changes` – uložení změn jako nové revize (`upsert` / `delete` podle id, `baseRevisionId` chrání proti přepsání cizích změn)
- `GET /api/v1/revisions` – historie se souhrnem změn
- `POST /api/v1/revisions/:id/restore` – obnovení starší verze (vznikne nová revize)

## Úpravy mapy

Tlačítko „Upravit mapu“ přepne do editoru (ovládání je v levém panelu):

- přesun uzlů a popisků tažením; oblast se přesouvá i s uzly a menšími oblastmi uvnitř
- velikost uzlu se mění tažením rohů vybraného uzlu
- lomený spoj: body lomu se táhnou, tažením „+“ přibude nový bod, dvojklik bod odebere,
  zaoblení rohů se nastaví v panelu
- přidání uzlu, spoje a popisku, úprava vlastností, správa typů spojů
- Zpět/Znovu (Ctrl+Z / Ctrl+Shift+Z), mazání klávesou Delete

Změny se drží v prohlížeči a až „Uložit“ vytvoří novou revizi. Před uložením proběhne kontrola sítě:
spoje s nepřipojeným koncem a lokality bez cesty do centrálního uzlu **4 PMV IGW** (id `4-pmv-igw`,
nelze jej smazat) se zvýrazní a vypíšou, nově vzniklé problémy zvlášť. Uložit lze i přesto.

V historii se po kliknutí na revizi zvýrazní, co změnila: přidané zeleně, změněné oranžově
(se seznamem změněných vlastností) a smazané jako červený přerušovaný obrys.

Typ spoje označený jako **vzdálený spoj** (např. „datová konektivita“, pronajatá optika mimo síť
hkfree) se nekreslí přes celou mapu, ale jen jako krátké konce u obou uzlů s názvem protější
strany. Kliknutím na kterýkoli konec se vybere celý spoj a zvýrazní se obě strany.

Vybraný uzel, spoj či zobrazená revize jsou v adrese za `#` (např. `#uzel=183-natura`,
`#spoj=183-natura--4-pmv-igw`, `#revize=3`), odkaz lze poslat dál a funguje tlačítko Zpět.
Id vznikne z názvu při prvním uložení a dál se nemění (ani při přejmenování), aby odkazy
a historie zůstaly platné. Spoj má id podle svých koncových uzlů.

## Kontejner (podman i docker)

```sh
podman-compose up --build -d          # nebo: docker compose up --build -d
# http://0.0.0.0:8080

# jednorázový import mapy do volume
podman-compose run --rm -v "$PWD/hkfree-cloud-map.dia:/tmp/map.dia:ro" \
  cloudmap node api/import-dia.js /tmp/map.dia
```

Proměnné prostředí: `PORT` (8080), `LISTEN_HOST` (0.0.0.0),
`DATABASE_URL` (`sqlite:/data/cloudmap.db`), `STATIC_DIR`, a pro přihlášení viz níže.
Compose je bere z prostředí nebo ze souboru `.env` (vzor v `.env.example`).

## Přihlášení (hkfree SSO)

Celá aplikace včetně API vyžaduje přihlášení přes Keycloak `sso.hkfree.org` (realm `hkfree`).
Upravovat může každý přihlášený. U každé revize je uložen autor ve tvaru `přezdívka (UserDB id)`.

| Proměnná | Význam |
| --- | --- |
| `DEV_MODE=true` | vypne přihlášení, autor změn je `dev` (jen pro vývoj a testování) |
| `PUBLIC_URL` | adresa aplikace, např. `https://cloudmap.hkfree.org` |
| `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | confidential klient v Keycloaku |
| `OIDC_ISSUER` | výchozí `https://sso.hkfree.org/realms/hkfree` |
| `SESSION_SECRET` | min. 32 znaků, šifruje cookie s přihlášením (`openssl rand -base64 48`) |
| `API_KEYS_FILE` | soubor s API klíči, v kontejneru `/data/api-keys.json` |

Bez `DEV_MODE=true` aplikace bez těchto proměnných nenastartuje.

Klient v Keycloaku: *Client authentication* zapnuto, *Standard flow*,
*Valid redirect URIs* `https://cloudmap.hkfree.org/auth/callback`,
*Valid post logout redirect URIs* `https://cloudmap.hkfree.org/`.
Přihlášení vydrží 7 dní od posledního použití aplikace, odhlášení je v levém panelu dole.

Skripty se přihlašují API klíčem v hlavičce `Authorization: Bearer <klíč>`. Klíče jsou
v JSON souboru `{"název": "klíč"}` (vzor `api-keys.example.json`, klíč min. 16 znaků),
autor změn je pak `api:název`. Po úpravě souboru je potřeba aplikaci restartovat:

```sh
podman-compose exec cloudmap vi /data/api-keys.json && podman-compose restart
curl -H "Authorization: Bearer <klíč>" https://cloudmap.hkfree.org/api/v1/map
```

## Verze a vydání

Verze se řídí `version` v kořenovém `package.json` (semver, začínáme na 0.1.0)
a zobrazuje se v patičce aplikace.

1. zvýšit verzi: `npm version 0.4.0 --no-git-tag-version` a commit
2. `git tag v0.4.0 && git push origin v0.4.0`
3. GitHub Actions otestuje kód, vydá image `ghcr.io/hkfree/cloudmap:0.4.0` (+ `:0.4`, `:latest`) a GitHub release

Každý push do `main` vydá image `:edge` pro testování.

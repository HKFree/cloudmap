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
npm run dev:api                                       # API na :8080
npm run dev:web                                       # web na :5173 (proxy /api)
npm test
npm run typecheck
```

API dokumentace (OpenAPI): `/api/v1/docs`. Hlavní endpointy:

- `GET /api/v1/map[?revision=N]` – celá mapa, aktuální nebo po revizi N
- `POST /api/v1/changes` – uložení změn jako nové revize (`upsert` / `delete` podle id, `baseRevisionId` chrání proti přepsání cizích změn)
- `GET /api/v1/revisions` – historie se souhrnem změn
- `POST /api/v1/revisions/:id/restore` – obnovení starší verze (vznikne nová revize)

## Úpravy mapy

Tlačítko „Upravit mapu“ přepne do editoru: přesun uzlů a popisků tažením (oblast se přesouvá
i s uzly uvnitř), přidání uzlu, spoje a popisku, úprava vlastností v pravém panelu, správa typů
spojů, Zpět/Znovu (Ctrl+Z / Ctrl+Shift+Z), mazání klávesou Delete. Změny se drží v prohlížeči
a až „Uložit“ vytvoří novou revizi.

Vybraný uzel, spoj či zobrazená revize jsou v adrese za `#` (např. `#spoj=…`, `#revize=3`),
odkaz lze poslat dál a funguje tlačítko Zpět v prohlížeči.

## Kontejner (podman i docker)

```sh
podman-compose up --build -d          # nebo: docker compose up --build -d
# http://0.0.0.0:8080

# jednorázový import mapy do volume
podman-compose run --rm -v "$PWD/hkfree-cloud-map.dia:/tmp/map.dia:ro" \
  cloudmap node api/import-dia.js /tmp/map.dia
```

Proměnné prostředí: `PORT` (8080), `LISTEN_HOST` (0.0.0.0),
`DATABASE_URL` (`sqlite:/data/cloudmap.db`), `STATIC_DIR`.

## Verze a vydání

Verze se řídí `version` v kořenovém `package.json` (semver, začínáme na 0.1.0)
a zobrazuje se v patičce aplikace.

1. zvýšit verzi: `npm version 0.2.0 --no-git-tag-version` a commit
2. `git tag v0.2.0 && git push --tags`
3. GitHub Actions otestuje kód, vydá image `ghcr.io/hkfree/cloudmap:0.2.0` (+ `:0.2`, `:latest`) a GitHub release

Každý push do `master` vydá image `:edge` pro testování.

# Painel da plataforma (portal-vila-web)

Painel web, para computador, de quem administra a plataforma: os condomínios que usam o Portal da Vila.
O aplicativo dos moradores continua sendo o `portal-vila-app`.

- React 19 + Vite 6 + TypeScript, Tailwind CSS 4, TanStack Query, React Router.
- Mesmas cores do aplicativo (claro e escuro) e fonte Inter.
- Fala com a mesma API (`VITE_API_URL`, padrão `http://localhost:8080/api`).

## Quem entra

A mesma conta do aplicativo, desde que o e-mail esteja em `PORTAL_PLATFORM_ADMIN_EMAILS` na API
(lista separada por vírgula). Ser dono da plataforma não muda o papel da conta no próprio condomínio.

## Rodar localmente

```bash
npm ci
VITE_API_URL=http://localhost:8083/api npm run dev   # http://localhost:5174
npm run build                                        # checa os tipos e gera dist/
```

## Publicação

Site estático no Render (`portal-vila-web` no `render.yaml`), refeito a cada push na `main`.

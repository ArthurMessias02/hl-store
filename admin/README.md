# Painel administrativo — `/admin/`

Painel mobile-first em uma única página (`index.html`), em HTML/CSS/JS puro, sem dependências.
**Não há link para ele na loja pública.** Passo a passo de configuração: `../docs/GUIA-CONFIGURACAO.md`.

```
admin/
├── index.html        # página única (as telas são trocadas por JS; rotas por #)
├── css/admin.css     # visual (celular primeiro; mesma paleta da loja)
└── js/
    ├── ui.js         # utilitários de tela: h(), avisos, confirmação, botão ocupado
    ├── client.js     # Supabase via fetch: login (Auth), banco (REST), fotos (Storage)
    ├── data.js       # regras: produtos, promoções, fotos (reduz antes de enviar), validações
    ├── views.js      # telas: início, produtos, promoções, formulários
    └── app.js        # rotas, login, sair, sessão expirada
```

Rotas: `#/login` · `#/` · `#/produtos` · `#/produtos/novo` · `#/produtos/<id>` · `#/promocoes` · `#/promocoes/nova` · `#/promocoes/<id>`

## Segurança
Esconder a URL não protege nada. Quem protege: login (Supabase Auth) + regras RLS no banco
(`../db/schema.sql`, função `is_admin()`). Mesmo alterando este JavaScript no navegador,
o banco recusa qualquer escrita de quem não é administrador.

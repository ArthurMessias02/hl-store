# HL Store — Landing Page

Landing page mobile-first da HL Store (moda masculina casual, social e premium), feita com HTML, CSS e JavaScript puros. Sem build, sem dependências.

## Estrutura

```
hl-store/
├── index.html          # Estrutura (HTML semântico)
├── css/styles.css      # Estilos e animações
├── js/
│   ├── config.js       # WhatsApp, Instagram, nome da marca
│   ├── products.js     # Dados dos produtos (edite aqui)
│   └── main.js         # Renderização, WhatsApp, "ver mais", animações
├── assets/images/      # Imagens (hoje: SVGs de demonstração)
└── README.md
```

## Executar localmente

Abra o `index.html` direto no navegador, ou, para simular melhor a hospedagem:

```bash
cd hl-store
python3 -m http.server 8000
# acesse http://localhost:8000
```

Teste no celular usando o modo responsivo do navegador (larguras de 360 a 430 px).


## Como editar

- **Produtos:** `js/products.js` (nome, descrição, preço, tamanhos, imagem, `inStock`, `featured`).
- **WhatsApp/Instagram/marca:** `js/config.js`.
- **Estoque:** troque `inStock` entre `true` e `false`. Peças indisponíveis mostram o status e um botão de *consulta de reposição*.
- **Logo:** é um SVG embutido no `index.html` (hero: `logo-svg--hero`; rodapé: `logo-svg--footer`). Para trocar "STORE" por "STORIES", edite o texto de `class="logo-svg__name"` nos dois lugares. A logo original enviada está salva em `assets/images/logo-original.jpg` apenas como referência.
- **Foto do hero (fundo):** no `index.html`, dentro de `<div class="hero__bg">`, troque `assets/images/hero.svg` pelo arquivo da sua foto (ex.: `assets/images/hero.jpg`, vertical, ~1080×1600 px).
- **Fotos:** coloque os arquivos em `assets/images/` (proporção 4:5, ex.: 1200×1500 px, em WebP ou JPG otimizado) e atualize o campo `image`.


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
- **Logo:** monograma HL (a perna direita do H vira a haste do L) com anel e "STORE". Arquivos prontos em `assets/images/`: `logo-hl.svg` e `logo-hl.png` (fundo transparente, 2000 px), `logo-hl-monograma.svg/png` (só anel + HL) e `logo-hl-perfil-1080.png` (fundo preto, para foto de perfil do Instagram). No site, o hero usa o SVG inline do `index.html` (animado) e o rodapé usa `logo-hl.svg`. Para trocar "STORE" por outro nome, é preciso gerar a logo de novo (o texto está convertido em curvas). Os ícones (`favicon.*`, `assets/icons/`) usam uma versão mais encorpada do monograma para continuar legível em tamanho pequeno.
- **Foto do hero (fundo):** no `index.html`, dentro de `<div class="hero__bg">`, troque `assets/images/hero.svg` pelo arquivo da sua foto (ex.: `assets/images/hero.jpg`, vertical, ~1080×1600 px).
- **Fotos:** coloque os arquivos em `assets/images/` (proporção 4:5, ex.: 1200×1500 px, em WebP ou JPG otimizado) e atualize o campo `image`.


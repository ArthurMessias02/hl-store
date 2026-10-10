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

## Publicar no Vercel

1. Crie uma conta em vercel.com e envie a pasta `hl-store` para um repositório no GitHub.
2. No Vercel, clique em **Add New → Project**, importe o repositório.
3. Em *Framework Preset* deixe **Other**; não é preciso comando de build nem pasta de saída.
4. Clique em **Deploy**. O Vercel gera um endereço `*.vercel.app` sem exigir domínio próprio.

Alternativa: instalar a CLI (`npm i -g vercel`) e rodar `vercel` dentro da pasta. Os recursos e limites disponíveis dependem do plano da sua conta; consulte a documentação do Vercel.

## Como editar

- **Produtos:** `js/products.js` (nome, descrição, preço, tamanhos, imagem, `inStock`, `featured`).
- **WhatsApp/Instagram/marca:** `js/config.js`.
- **Estoque:** troque `inStock` entre `true` e `false`. Peças indisponíveis mostram o status e um botão de *consulta de reposição*.
- **Logo:** é um SVG embutido no `index.html` (hero: `logo-svg--hero`; rodapé: `logo-svg--footer`). Para trocar "STORE" por "STORIES", edite o texto de `class="logo-svg__name"` nos dois lugares. A logo original enviada está salva em `assets/images/logo-original.jpg` apenas como referência.
- **Foto do hero (fundo):** no `index.html`, dentro de `<div class="hero__bg">`, troque `assets/images/hero.svg` pelo arquivo da sua foto (ex.: `assets/images/hero.jpg`, vertical, ~1080×1600 px).
- **Fotos:** coloque os arquivos em `assets/images/` (proporção 4:5, ex.: 1200×1500 px, em WebP ou JPG otimizado) e atualize o campo `image`.

## ✅ Antes de publicar, substitua

| Item | Onde | Situação atual |
|---|---|---|
| Número de WhatsApp | `js/config.js` → `whatsappNumber` | Fictício (`5500000000000`) |
| Link do Instagram | `js/config.js` → `instagramUrl` | Genérico (`instagram.com`) |
| Nome sob o logo (STORE ou STORIES) | `index.html` → `logo-svg__name` (hero e rodapé) | `STORE` |
| Nomes dos 10 produtos | `js/products.js` → `name` | Demonstração |
| Descrições | `js/products.js` → `description` | Demonstração |
| Preços | `js/products.js` → `price` | Fictícios |
| Tamanhos por peça | `js/products.js` → `sizes` | Demonstração |
| Estoque de cada peça | `js/products.js` → `inStock` | Demonstração |
| Peças com selo "DESTAQUE" | `js/products.js` → `featured` | Demonstração |
| Fotos dos produtos | `assets/images/produto-01..10.svg` | Placeholders |
| Foto do hero | `assets/images/hero.svg` (referenciada no `index.html`) | Placeholder; use foto de campanha |
| Frases do hero e do rodapé | `index.html` | Sugestões editáveis |
| Aviso "Produtos e preços de demonstração" | `index.html` (`.demo-note`) | Remover após inserir dados reais |
| Título/descrição SEO | `index.html` (`<title>`, `meta description`) | Revisar |

Nenhum endereço, avaliação, certificação ou política comercial foi inventado.

## Observações técnicas

- Animações com CSS + `IntersectionObserver`; respeitam `prefers-reduced-motion`.
- Fontes (Cormorant Garamond e Inter) vêm do Google Fonts; se indisponíveis, a página usa fontes do sistema.
- Imagens com `alt`, `loading="lazy"` e tratamento de erro de carregamento.
- Mensagens do WhatsApp codificadas com `encodeURIComponent()`.

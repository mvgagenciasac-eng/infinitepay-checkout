require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json());

// Página inicial da API
app.get("/", (req, res) => {
  res.status(200).send("InfinitePay Checkout API online");
});

// Teste InfinitePay no navegador
app.get("/test-checkout", async (req, res) => {
  try {
    const payload = {
      handle: process.env.INFINITE_TAG,
      items: [
        {
          description: "Produto Teste",
          quantity: 1,
          price: 1000
        }
      ],
      redirect_url: process.env.SUCCESS_URL
    };

    const response = await axios.post(
      "https://api.checkout.infinitepay.io/links",
      payload
    );

    const checkoutUrl =
      response.data.url || response.data.checkout_url || response.data.link;

    res.redirect(checkoutUrl);
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({
      error: error.response?.data || error.message
    });
  }
});

// Criar checkout InfinitePay via Shopify
app.post("/create-checkout", async (req, res) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: "Carrinho vazio ou inválido"
      });
    }

    const payload = {
      handle: process.env.INFINITE_TAG,
      items: items.map((i) => ({
        description: i.title,
        quantity: i.quantity,
        price: Math.round(Number(i.price) * 100)
      })),
      redirect_url: process.env.SUCCESS_URL
    };

    const response = await axios.post(
      "https://api.checkout.infinitepay.io/links",
      payload
    );

    const checkoutUrl =
      response.data.url || response.data.checkout_url || response.data.link;

    res.json({ checkout_url: checkoutUrl });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({
      error: error.response?.data || error.message
    });
  }
});

// Webhook InfinitePay
app.post("/webhook", async (req, res) => {
  try {
    const event = req.body;

    console.log("Webhook InfinitePay recebido:", event);

    if (event.status === "paid") {
      console.log("Pagamento aprovado:", event);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error(error.message);
    res.sendStatus(500);
  }
});

// Iniciar instalação Shopify OAuth
app.get("/auth", async (req, res) => {
  try {
    const shop = req.query.shop;

    if (!shop) {
      return res.status(400).send("Loja não informada. Use ?shop=sua-loja.myshopify.com");
    }

    const state = crypto.randomBytes(16).toString("hex");
    const redirectUri = `${process.env.APP_URL}/auth/callback`;

    const installUrl =
      `https://${shop}/admin/oauth/authorize` +
      `?client_id=${process.env.SHOPIFY_API_KEY}` +
      `&scope=${encodeURIComponent(process.env.SHOPIFY_SCOPES)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}`;

    res.redirect(installUrl);
  } catch (error) {
    console.error(error.message);
    res.status(500).send("Erro ao iniciar instalação do app");
  }
});

// Callback Shopify OAuth
app.get("/auth/callback", async (req, res) => {
  try {
    const { shop, code } = req.query;

    if (!shop || !code) {
      return res.status(400).send("Parâmetros ausentes: shop ou code");
    }

    const tokenResponse = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code
      }
    );

    const accessToken = tokenResponse.data.access_token;

    res.send(`
      <h1>App instalado com sucesso!</h1>
      <p>Copie este token e salve no Railway como <strong>SHOPIFY_ACCESS_TOKEN</strong>:</p>
      <textarea rows="8" cols="90" readonly>${accessToken}</textarea>
      <p>Loja: ${shop}</p>
    `);
  } catch (error) {
    console.error(error.response?.data || error.message);

    res.status(500).send(`
      <h1>Erro ao instalar app</h1>
      <pre>${JSON.stringify(error.response?.data || error.message, null, 2)}</pre>
    `);
  }
});
// Checkout próprio
app.post("/checkout", async (req, res) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).send("Carrinho vazio");
    }

    let total = 0;

    const formatMoney = (value) => {
      return Number(value).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
      });
    };

    const itemsHtml = items.map((item) => {
      const price = Number(item.price);
      const quantity = Number(item.quantity);
      const itemTotal = price * quantity;

      total += itemTotal;

      return `
        <div class="order-item">
          <div class="product-image-wrap">
            <img src="${item.image}" class="product-image" />
            <span class="qty-badge">${quantity}</span>
          </div>

          <div class="product-info">
            <strong>${item.title}</strong>
            <span>${item.variant_title || "Padrão"}</span>
          </div>

          <div class="product-price">
            ${formatMoney(itemTotal)}
          </div>
        </div>
      `;
    }).join("");

    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Checkout Forllini</title>

        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            color: #111;
            background: #fff;
          }

          .header {
            text-align: center;
            padding: 32px 20px 28px;
            border-bottom: 1px solid #e5e5e5;
          }

         .brand {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 42px;
  letter-spacing: 4px;
  line-height: 1;
  font-weight: 400;
}

          .subtitle {
  margin-top: 4px;
  font-size: 11px;
  letter-spacing: 2px;
  color: #666;
}

          .checkout {
            display: grid;
            grid-template-columns: 1.1fr 0.9fr;
            min-height: 760px;
          }

          .left {
            padding: 42px 44px;
          }

          .right {
            background: #f7f7f7;
            padding: 42px 44px;
            border-left: 1px solid #e5e5e5;
          }

          .steps {
            display: flex;
            gap: 10px;
            align-items: center;
            color: #777;
            font-size: 14px;
            margin-bottom: 34px;
          }

          .steps strong {
            color: #111;
          }

          h2 {
            font-size: 21px;
            margin: 0 0 18px;
          }

          .section-title {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }

          .login-text {
            font-size: 14px;
            color: #555;
          }

          .login-text a {
            color: #1769e0;
            text-decoration: none;
          }

          .field {
  width: 100%;
  height: 46px;
  border: 1px solid #d9d9d9;
  border-radius: 5px;
  padding: 0 12px;
  font-size: 14px;
  outline: none;
  background: white;
}

          .field:focus {
            border-color: #111;
          }

          .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
          }

          .field-group {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 32px;
          }

          .checkbox-line {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 14px;
            margin: 14px 0 32px;
          }

          .checkbox-line input {
            width: 18px;
            height: 18px;
          }

          .pay-button {
  width: 100%;
  height: 52px;
  border: none;
  background: #000;
  color: white;
  border-radius: 6px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 18px;
}

          .pay-button:hover {
            opacity: 0.9;
          }

          .button-divider {
            width: 1px;
            height: 30px;
            background: rgba(255,255,255,0.35);
          }

          h2 {
  font-size: 18px;
  margin: 0 0 14px;
}

<img loading="eager" src="https://cdn.prod.website-files.com/65c1399ac999a342139b5069/65c1399ac999a342139b5434_logo_brlc_preto.svg" alt="Logo InfinitePay" class="img-logo_infinitepay w-variant-c74a8267-4291-3686-2047-6a4b3b9bb8fa is-responsive">

          .ip-circle {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 4px solid #19e000;
  box-shadow: inset 0 -4px 0 #e9d600;
  background: #151327;
}

          .secure-note {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 8px;
            color: #777;
            font-size: 14px;
            margin-top: 20px;
          }

          .order-item {
            display: grid;
            grid-template-columns: 82px 1fr auto;
            gap: 16px;
            align-items: center;
            margin-bottom: 26px;
          }

          .product-image-wrap {
            position: relative;
            width: 82px;
            height: 82px;
            background: white;
            border: 1px solid #ddd;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .product-image {
            width: 74px;
            height: 74px;
            object-fit: cover;
            border-radius: 6px;
          }

          .qty-badge {
            position: absolute;
            top: -10px;
            right: -10px;
            background: #666;
            color: white;
            width: 26px;
            height: 26px;
            border-radius: 50%;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
          }

          .product-info {
            display: flex;
            flex-direction: column;
            gap: 7px;
            font-size: 14px;
            line-height: 1.35;
          }

          .product-info span {
            color: #666;
          }

          .product-price {
            font-weight: bold;
            font-size: 15px;
            white-space: nowrap;
          }

          .summary-line {
            display: flex;
            justify-content: space-between;
            margin-bottom: 18px;
            font-size: 16px;
          }

          .summary-line.muted {
            color: #666;
          }

          .total-line {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin: 26px 0 34px;
            font-size: 26px;
            font-weight: 800;
          }

          .divider {
            border-top: 1px solid #ddd;
            margin: 28px 0;
          }

          .trust-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 20px;
            margin: 24px 0;
          }

          .trust-left {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .shield {
            color: #10a53a;
            font-size: 28px;
          }

          .trust-text strong {
            display: block;
            font-size: 15px;
          }

          .trust-text span {
            color: #666;
            font-size: 13px;
          }

          .payment-info {
            display: flex;
            align-items: center;
            gap: 10px;
            color: #666;
            font-size: 14px;
          }

          .benefits {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 22px;
            padding: 34px 44px;
            border-top: 1px solid #e5e5e5;
            border-bottom: 1px solid #e5e5e5;
          }

          .benefit {
            display: flex;
            align-items: center;
            gap: 14px;
          }

          .benefit-icon {
            font-size: 30px;
          }

          .benefit strong {
            display: block;
            font-size: 14px;
          }

          .benefit span {
            font-size: 13px;
            color: #555;
          }

          .footer {
            display: grid;
            grid-template-columns: 2fr 1fr 1fr;
            gap: 30px;
            padding: 34px 44px;
            background: #fafafa;
          }

          .footer h3 {
            margin: 0 0 14px;
            font-size: 18px;
          }

          .footer p,
          .footer a {
            display: block;
            color: #444;
            font-size: 14px;
            line-height: 1.7;
            text-decoration: none;
            margin: 0;
          }

          .copyright {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 18px 44px;
            font-size: 13px;
            color: #666;
            border-top: 1px solid #e5e5e5;
          }

          @media (max-width: 900px) {
            .brand {
              font-size: 42px;
            }

            .checkout {
              grid-template-columns: 1fr;
            }

            .right {
              border-left: none;
              border-top: 1px solid #e5e5e5;
            }

            .left,
            .right {
              padding: 28px 18px;
            }

            .grid-2 {
              grid-template-columns: 1fr;
            }

            .benefits,
            .footer {
              grid-template-columns: 1fr;
              padding: 28px 18px;
            }

            .copyright {
              flex-direction: column;
              gap: 12px;
              padding: 20px 18px;
              text-align: center;
            }

            .pay-button {
              font-size: 17px;
              gap: 12px;
            }

        <img loading="eager" src="https://cdn.prod.website-files.com/65c1399ac999a342139b5069/65c1399ac999a342139b5434_logo_brlc_preto.svg" alt="Logo InfinitePay" class="img-logo_infinitepay w-variant-c74a8267-4291-3686-2047-6a4b3b9bb8fa is-responsive">
          }
          .reviews {
  padding: 50px 44px;
  background: #fff;
}

.reviews-title {
  text-align: center;
  font-size: 28px;
  margin-bottom: 36px;
}

.reviews-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 18px;
}

.review-card {
  background: #fafafa;
  border: 1px solid #e5e5e5;
  border-radius: 12px;
  padding: 22px;
}

.review-card p {
  font-size: 14px;
  line-height: 1.6;
  color: #444;
  margin: 14px 0 18px;
}

.review-card strong {
  display: block;
  font-size: 14px;
}

.review-card span {
  font-size: 13px;
  color: #777;
}

.stars {
  color: #ffb400;
  font-size: 18px;
  letter-spacing: 2px;
}

@media (max-width: 900px) {

  .reviews {
    padding: 40px 18px;
  }

  .reviews-grid {
    grid-template-columns: 1fr;
  }

  .reviews-title {
    font-size: 24px;
  }

}
        </style>
      </head>

      <body>
        <header class="header">
          <div class="brand">FORLLINI</div>
          <div class="subtitle">MODA MASCULINA</div>
        </header>

        <main class="checkout">
          <section class="left">
            <div class="steps">
              <span>Carrinho</span>
              <span>›</span>
              <strong>Informações</strong>
              <span>›</span>
              <span>Pagamento</span>
            </div>

            <div class="section-title">
              <h2>Contato</h2>
              <div class="login-text">Já possui uma conta? <a href="/account/login">Entrar</a></div>
            </div>

            <div class="field-group">
              <input class="field" placeholder="E-mail ou WhatsApp" />
            </div>

            <label class="checkbox-line">
              <input type="checkbox" />
              Quero receber novidades e ofertas exclusivas
            </label>

            <h2>Entrega</h2>

            <div class="field-group">
              <select class="field">
                <option>Brasil</option>
              </select>

              <div class="grid-2">
                <input class="field" placeholder="Nome completo" />
                <input class="field" placeholder="CPF" />
              </div>

              <input class="field" placeholder="CEP" />
              <input class="field" placeholder="Endereço" />

              <div class="grid-2">
                <input class="field" placeholder="Número" />
                <input class="field" placeholder="Complemento (opcional)" />
              </div>

              <input class="field" placeholder="Bairro" />

              <div class="grid-2">
                <input class="field" placeholder="Cidade" />
                <select class="field">
                  <option>Estado</option>
                  <option>AC</option><option>AL</option><option>AP</option><option>AM</option>
                  <option>BA</option><option>CE</option><option>DF</option><option>ES</option>
                  <option>GO</option><option>MA</option><option>MT</option><option>MS</option>
                  <option>MG</option><option>PA</option><option>PB</option><option>PR</option>
                  <option>PE</option><option>PI</option><option>RJ</option><option>RN</option>
                  <option>RS</option><option>RO</option><option>RR</option><option>SC</option>
                  <option>SP</option><option>SE</option><option>TO</option>
                </select>
              </div>
            </div>

            <label class="checkbox-line">
              <input type="checkbox" />
              Salvar minhas informações para a próxima compra
            </label>

            <button class="pay-button">
              <span class="lock"></span>
              <span>Ir para o pagamento</span>
                       
            </button>

            <div class="secure-note">
            <img loading="eager" src="https://cdn.prod.website-files.com/65c1399ac999a342139b5069/65c1399ac999a342139b5434_logo_brlc_preto.svg" alt="Logo InfinitePay" class="img-logo_infinitepay w-variant-c74a8267-4291-3686-2047-6a4b3b9bb8fa is-responsive">
            </div>
          </section>

          <aside class="right">
            ${itemsHtml}

            <div class="divider"></div>

            <div class="summary-line">
              <span>Subtotal</span>
              <strong>${formatMoney(total)}</strong>
            </div>

            <div class="summary-line muted">
              <span>Frete Grátis <svg role="presentation" fill="none" focusable="false" stroke-width="1" width="24" height="24" class="icon icon-picto-truck" viewBox="0 0 24 24">
        <path d="M19 17.798h1.868a1.714 1.714 0 0 0 1.715-1.715V11.25a3.274 3.274 0 0 0-3.275-3.274H14.395l-.097 7.869" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path>
        <path d="M8.71 18.175c1.565 0 3.094-.16 4.572-.321m-9.94-.087a1.78 1.78 0 0 1-1.576-1.56c-.189-1.594-.407-3.256-.407-4.96 0-1.705.216-3.366.405-4.96a1.783 1.783 0 0 1 1.577-1.56c1.725-.186 3.523-.409 5.37-.409s3.644.223 5.368.408a1.783 1.783 0 0 1 1.578 1.56c.066.564.136 1.135.199 1.714" stroke="currentColor"></path>
        <path d="M16.061 21.069a2.894 2.894 0 1 1 0-5.793 2.894 2.894 0 0 1 0 5.794v-.001ZM5.832 21.069a2.894 2.894 0 1 1 0-5.792 2.894 2.894 0 0 1 0 5.793v-.001Z" fill="currentColor" fill-opacity=".12" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
              <span>8 à 12 Dias úteis</span>
            </div>

            <div class="total-line">
              <span>Total</span>
              <span>${formatMoney(total)}</span>
            </div>

            <div class="trust-row">
              <div class="trust-left">
                <div class="shield"><svg role="presentation" fill="none" focusable="false" stroke-width="1" width="24" height="24" class="sm:hidden icon icon-picto-lock" viewBox="0 0 24 24">
        <path d="M3.236 18.182a5.071 5.071 0 0 0 4.831 4.465 114.098 114.098 0 0 0 7.865-.001 5.07 5.07 0 0 0 4.831-4.464 23.03 23.03 0 0 0 .165-2.611c0-.881-.067-1.752-.165-2.61a5.07 5.07 0 0 0-4.83-4.465c-1.311-.046-2.622-.07-3.933-.069a109.9 109.9 0 0 0-3.933.069 5.07 5.07 0 0 0-4.83 4.466 23.158 23.158 0 0 0-.165 2.609c0 .883.067 1.754.164 2.61Z" fill="currentColor" fill-opacity=".12" stroke="currentColor"></path>
        <path d="M17 8.43V6.285A5 5 0 0 0 7 6.286V8.43" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path>
        <path d="M12 17.714a2.143 2.143 0 1 0 0-4.286 2.143 2.143 0 0 0 0 4.286Z" stroke="currentColor"></path>
      </svg></div>
                <div class="trust-text">
                  <strong>Ambiente seguro</strong>
                 </div>
              </div>

              <img loading="eager" src="https://cdn.prod.website-files.com/65c1399ac999a342139b5069/65c1399ac999a342139b5434_logo_brlc_preto.svg" alt="Logo InfinitePay" class="img-logo_infinitepay w-variant-c74a8267-4291-3686-2047-6a4b3b9bb8fa is-responsive">

            </div>
          </aside>
        </main>

<section class="reviews">

  <h2 class="reviews-title">
 Avaliações de clientes
  <div class="stars">★★★★★</div>
  </h2>

  <div class="reviews-grid">

    <div class="review-card">
      <div class="stars">★★★★★</div>

      <p>
        “Produto chegou rápido e a qualidade superou minhas expectativas.”
      </p>

      <strong>Marcos Vinícius</strong>
      <span>São Paulo - SP</span>
    </div>

    <div class="review-card">
      <div class="stars">★★★★★</div>

      <p>
        “Processo de compra muito simples e pagamento aprovado na hora.”
      </p>

      <strong>Felipe Andrade</strong>
      <span>Rio de Janeiro - RJ</span>
    </div>

    <div class="review-card">
      <div class="stars">★★★★★</div>

      <p>
        “Atendimento excelente e produto exatamente como nas fotos.”
      </p>

      <strong>Lucas Martins</strong>
      <span>Belo Horizonte - MG</span>
    </div>

    <div class="review-card">
      <div class="stars">★★★★★</div>

      <p>
        “Com certeza voltarei a comprar. Loja muito confiável.”
      </p>

      <strong>Renato Alves</strong>
      <span>Curitiba - PR</span>
    </div>

  </div>

</section>

        <footer class="footer">
          <div>
            <h3>Loja Forllini</h3>
            <p>✉️ sac@lojaforllini.com</p>
            <p>📍 Avenida Dom Hélder Câmara 05200, Sal 423,<br>
            20771-004 Rio de Janeiro RJ, Brasil</p>
          </div>

          <div>
  <h3>Institucional</h3>

  <a href="https://lojaforllini.com/policies/privacy-policy">
    Política de Privacidade
  </a>

  <a href="https://lojaforllini.com/policies/refund-policy">
    Política de Devolução
  </a>

  <a href="https://lojaforllini.com/policies/shipping-policy">
    Política de Frete
  </a>

  <a href="https://lojaforllini.com/policies/terms-of-service">
    Termos de Serviço
  </a>
</div>

          <div>
            <h3>Atendimento</h3>
            <a href="https://lojaforllini.com/pages/contact">
  Fale conosco
</a>
          </div>
        </footer>

        <div class="copyright">
          <span>© 2024 Loja Forllini. Todos os direitos reservados.</span>

          <div class="footer-payment">
  <span><svg width="89" height="19" viewBox="0 0 89 19" fill="#898792" xmlns="http://www.w3.org/2000/svg">
<path fill-rule="evenodd" clip-rule="evenodd" d="M9.75 14.1875V8.5C9.75 8.05127 9.38623 7.6875 8.9375 7.6875L2.4375 7.6875C1.98877 7.6875 1.625 8.05127 1.625 8.5L1.625 14.1875C1.625 14.6362 1.98877 15 2.4375 15H8.9375C9.38623 15 9.75 14.6362 9.75 14.1875ZM11.375 8.5V14.1875C11.375 15.5337 10.2837 16.625 8.9375 16.625H2.4375C1.09131 16.625 -5.8844e-08 15.5337 0 14.1875L2.48609e-07 8.5C3.07453e-07 7.15381 1.09131 6.0625 2.4375 6.0625L8.9375 6.0625C10.2837 6.0625 11.375 7.15381 11.375 8.5Z"></path>
<path fill-rule="evenodd" clip-rule="evenodd" d="M5.6875 3.625C4.79004 3.625 4.0625 4.35254 4.0625 5.25V6.875H2.4375V5.25C2.4375 3.45507 3.89257 2 5.6875 2C7.48243 2 8.9375 3.45507 8.9375 5.25V6.875H7.3125V5.25C7.3125 4.35254 6.58496 3.625 5.6875 3.625Z"></path>
<path fill-rule="evenodd" clip-rule="evenodd" d="M6.5 10.125L6.5 12.5625H4.875L4.875 10.125H6.5Z"></path>
<path d="M23.136 0.11C23.73 0.11 24.236 0.205333 24.654 0.396C25.072 0.586667 25.391 0.861666 25.611 1.221C25.831 1.58033 25.941 2.01667 25.941 2.53C25.941 3.04333 25.831 3.47967 25.611 3.839C25.391 4.19833 25.072 4.47333 24.654 4.664C24.236 4.85467 23.73 4.95 23.136 4.95H21.695V7.37H19.803V0.11H23.136ZM22.839 3.531C23.235 3.531 23.532 3.45033 23.73 3.289C23.9353 3.12033 24.038 2.86733 24.038 2.53C24.038 2.19267 23.9353 1.94333 23.73 1.782C23.532 1.61333 23.235 1.529 22.839 1.529H21.695V3.531H22.839Z"></path>
<path d="M33.0094 7.37H31.0624L30.5564 5.731H28.0704L27.5534 7.37H25.6504L28.2024 0.11H30.4684L33.0094 7.37ZM28.4224 4.444H30.2044L29.3134 1.507L28.4224 4.444Z"></path>
<path d="M36.5882 7.48C35.9429 7.48 35.3672 7.337 34.8612 7.051C34.3626 6.765 33.9739 6.34333 33.6952 5.786C33.4166 5.22867 33.2772 4.55033 33.2772 3.751C33.2772 2.96633 33.4239 2.29533 33.7172 1.738C34.0106 1.18067 34.4286 0.751667 34.9712 0.451C35.5212 0.150333 36.1666 0 36.9072 0C37.7286 0 38.3922 0.150333 38.8982 0.451C39.4042 0.744333 39.7966 1.21367 40.0752 1.859L38.3262 2.552C38.2309 2.178 38.0622 1.90667 37.8202 1.738C37.5782 1.56933 37.2776 1.485 36.9182 1.485C36.5589 1.485 36.2509 1.573 35.9942 1.749C35.7376 1.91767 35.5432 2.17067 35.4112 2.508C35.2792 2.838 35.2132 3.24867 35.2132 3.74C35.2132 4.25333 35.2792 4.68233 35.4112 5.027C35.5506 5.37167 35.7522 5.62833 36.0162 5.797C36.2876 5.95833 36.6212 6.039 37.0172 6.039C37.2299 6.039 37.4242 6.01333 37.6002 5.962C37.7762 5.91067 37.9302 5.83733 38.0622 5.742C38.1942 5.63933 38.2969 5.51467 38.3702 5.368C38.4436 5.214 38.4802 5.03433 38.4802 4.829V4.719H36.8192V3.454H40.0862V7.37H38.7992L38.6562 5.665L38.9642 5.929C38.8102 6.42767 38.5316 6.81267 38.1282 7.084C37.7322 7.348 37.2189 7.48 36.5882 7.48Z"></path>
<path d="M48.1344 7.37H46.1874L45.6814 5.731H43.1954L42.6784 7.37H40.7754L43.3274 0.11H45.5934L48.1344 7.37ZM43.5474 4.444H45.3294L44.4384 1.507L43.5474 4.444Z"></path>
<path d="M57.3828 0.11V7.37H55.7108V4.037L55.7658 1.804H55.7438L53.9508 7.37H52.4218L50.6288 1.804H50.6068L50.6618 4.037V7.37H48.9788V0.11H51.6738L52.8178 3.806L53.2248 5.346H53.2468L53.6648 3.817L54.7978 0.11H57.3828Z"></path>
<path d="M58.9905 7.37V0.11H64.6445V1.573H60.8825V3.047H63.8745V4.422H60.8825V5.907H64.7875V7.37H58.9905Z"></path>
<path d="M72.4749 0.11V7.37H70.3739L68.1189 3.443L67.5689 2.365H67.5579L67.6019 3.707V7.37H65.9299V0.11H68.0309L70.2859 4.037L70.8359 5.115H70.8469L70.8029 3.773V0.11H72.4749Z"></path>
<path d="M80.1883 0.11V1.573H77.8233V7.37H75.9313V1.573H73.5553V0.11H80.1883Z"></path>
<path d="M84.225 0C84.9583 0 85.589 0.150333 86.117 0.451C86.6523 0.744333 87.063 1.16967 87.349 1.727C87.635 2.28433 87.778 2.95533 87.778 3.74C87.778 4.52467 87.635 5.19567 87.349 5.753C87.063 6.31033 86.6523 6.73933 86.117 7.04C85.589 7.33333 84.9583 7.48 84.225 7.48C83.4917 7.48 82.8573 7.33333 82.322 7.04C81.7867 6.73933 81.376 6.31033 81.09 5.753C80.804 5.19567 80.661 4.52467 80.661 3.74C80.661 2.95533 80.804 2.28433 81.09 1.727C81.376 1.16967 81.7867 0.744333 82.322 0.451C82.8573 0.150333 83.4917 0 84.225 0ZM84.225 1.485C83.873 1.485 83.576 1.56933 83.334 1.738C83.092 1.90667 82.9087 2.15967 82.784 2.497C82.6593 2.827 82.597 3.24133 82.597 3.74C82.597 4.23133 82.6593 4.64567 82.784 4.983C82.9087 5.32033 83.092 5.57333 83.334 5.742C83.576 5.91067 83.873 5.995 84.225 5.995C84.577 5.995 84.8703 5.91067 85.105 5.742C85.347 5.57333 85.5303 5.32033 85.655 4.983C85.7797 4.64567 85.842 4.23133 85.842 3.74C85.842 3.24133 85.7797 2.827 85.655 2.497C85.5303 2.15967 85.347 1.90667 85.105 1.738C84.8703 1.56933 84.577 1.485 84.225 1.485Z"></path>
<path d="M21.03 18.37V13.84C21.03 13.7067 21.03 13.57 21.03 13.43C21.0367 13.2833 21.0433 13.13 21.05 12.97C20.8233 13.19 20.5633 13.38 20.27 13.54C19.9833 13.6933 19.6867 13.8033 19.38 13.87L19.18 12.94C19.32 12.92 19.4833 12.8733 19.67 12.8C19.8567 12.7267 20.05 12.6333 20.25 12.52C20.45 12.4067 20.6333 12.2867 20.8 12.16C20.9667 12.0267 21.0967 11.8967 21.19 11.77H22.09V18.37H21.03Z"></path>
<path d="M26.1634 18.47C25.3701 18.47 24.7468 18.1833 24.2934 17.61C23.8468 17.03 23.6234 16.1833 23.6234 15.07C23.6234 13.9567 23.8468 13.1133 24.2934 12.54C24.7468 11.96 25.3701 11.67 26.1634 11.67C26.9634 11.67 27.5868 11.96 28.0334 12.54C28.4868 13.1133 28.7134 13.9567 28.7134 15.07C28.7134 16.1833 28.4868 17.03 28.0334 17.61C27.5868 18.1833 26.9634 18.47 26.1634 18.47ZM26.1634 17.56C26.4834 17.56 26.7501 17.47 26.9634 17.29C27.1834 17.1033 27.3468 16.8267 27.4534 16.46C27.5668 16.0867 27.6234 15.6233 27.6234 15.07C27.6234 14.5167 27.5668 14.0567 27.4534 13.69C27.3468 13.3167 27.1834 13.04 26.9634 12.86C26.7501 12.6733 26.4834 12.58 26.1634 12.58C25.8434 12.58 25.5734 12.6733 25.3534 12.86C25.1401 13.04 24.9801 13.3167 24.8734 13.69C24.7668 14.0567 24.7134 14.5167 24.7134 15.07C24.7134 15.6233 24.7668 16.0867 24.8734 16.46C24.9801 16.8267 25.1401 17.1033 25.3534 17.29C25.5734 17.47 25.8434 17.56 26.1634 17.56Z"></path>
<path d="M32.4427 18.47C31.6494 18.47 31.0261 18.1833 30.5727 17.61C30.1261 17.03 29.9027 16.1833 29.9027 15.07C29.9027 13.9567 30.1261 13.1133 30.5727 12.54C31.0261 11.96 31.6494 11.67 32.4427 11.67C33.2427 11.67 33.8661 11.96 34.3127 12.54C34.7661 13.1133 34.9927 13.9567 34.9927 15.07C34.9927 16.1833 34.7661 17.03 34.3127 17.61C33.8661 18.1833 33.2427 18.47 32.4427 18.47ZM32.4427 17.56C32.7627 17.56 33.0294 17.47 33.2427 17.29C33.4627 17.1033 33.6261 16.8267 33.7327 16.46C33.8461 16.0867 33.9027 15.6233 33.9027 15.07C33.9027 14.5167 33.8461 14.0567 33.7327 13.69C33.6261 13.3167 33.4627 13.04 33.2427 12.86C33.0294 12.6733 32.7627 12.58 32.4427 12.58C32.1227 12.58 31.8527 12.6733 31.6327 12.86C31.4194 13.04 31.2594 13.3167 31.1527 13.69C31.0461 14.0567 30.9927 14.5167 30.9927 15.07C30.9927 15.6233 31.0461 16.0867 31.1527 16.46C31.2594 16.8267 31.4194 17.1033 31.6327 17.29C31.8527 17.47 32.1227 17.56 32.4427 17.56Z"></path>
<path d="M37.362 18.37L41.682 11.77H42.602L38.292 18.37H37.362ZM37.622 11.67C37.962 11.67 38.2554 11.7467 38.502 11.9C38.7554 12.0533 38.9487 12.2667 39.082 12.54C39.222 12.8133 39.292 13.1367 39.292 13.51C39.292 13.8767 39.222 14.2 39.082 14.48C38.9487 14.7533 38.7554 14.9667 38.502 15.12C38.2554 15.2733 37.962 15.35 37.622 15.35C37.2887 15.35 36.9954 15.2733 36.742 15.12C36.4887 14.9667 36.292 14.7533 36.152 14.48C36.0187 14.2 35.952 13.8767 35.952 13.51C35.952 13.1367 36.0187 12.8133 36.152 12.54C36.292 12.2667 36.4887 12.0533 36.742 11.9C36.9954 11.7467 37.2887 11.67 37.622 11.67ZM37.622 12.45C37.4554 12.45 37.312 12.4933 37.192 12.58C37.072 12.66 36.982 12.78 36.922 12.94C36.862 13.0933 36.832 13.2833 36.832 13.51C36.832 13.73 36.862 13.92 36.922 14.08C36.982 14.24 37.072 14.36 37.192 14.44C37.312 14.52 37.4554 14.56 37.622 14.56C37.7954 14.56 37.942 14.52 38.062 14.44C38.182 14.36 38.272 14.24 38.332 14.08C38.392 13.92 38.422 13.73 38.422 13.51C38.422 13.2833 38.392 13.0933 38.332 12.94C38.272 12.78 38.182 12.66 38.062 12.58C37.942 12.4933 37.7954 12.45 37.622 12.45ZM42.342 14.79C42.682 14.79 42.9754 14.8667 43.222 15.02C43.4754 15.1733 43.6687 15.39 43.802 15.67C43.942 15.9433 44.012 16.2633 44.012 16.63C44.012 17.0033 43.942 17.3267 43.802 17.6C43.6687 17.8733 43.4754 18.0867 43.222 18.24C42.9754 18.3933 42.682 18.47 42.342 18.47C42.0087 18.47 41.7154 18.3933 41.462 18.24C41.2087 18.0867 41.012 17.8733 40.872 17.6C40.7387 17.3267 40.672 17.0033 40.672 16.63C40.672 16.2633 40.7387 15.9433 40.872 15.67C41.012 15.39 41.2087 15.1733 41.462 15.02C41.7154 14.8667 42.0087 14.79 42.342 14.79ZM42.342 15.58C42.1754 15.58 42.032 15.62 41.912 15.7C41.792 15.78 41.702 15.9 41.642 16.06C41.582 16.2133 41.552 16.4033 41.552 16.63C41.552 16.85 41.582 17.04 41.642 17.2C41.702 17.36 41.792 17.4833 41.912 17.57C42.032 17.65 42.1754 17.69 42.342 17.69C42.5154 17.69 42.662 17.65 42.782 17.57C42.902 17.4833 42.992 17.36 43.052 17.2C43.112 17.04 43.142 16.85 43.142 16.63C43.142 16.41 43.112 16.22 43.052 16.06C42.992 15.9 42.902 15.78 42.782 15.7C42.662 15.62 42.5154 15.58 42.342 15.58Z"></path>
<path d="M50.8628 11.67C51.4561 11.67 51.9695 11.7833 52.4028 12.01C52.8361 12.23 53.2028 12.5567 53.5028 12.99L52.7828 13.68C52.5295 13.2933 52.2428 13.0167 51.9228 12.85C51.6095 12.6767 51.2361 12.59 50.8028 12.59C50.4828 12.59 50.2195 12.6333 50.0128 12.72C49.8061 12.8067 49.6528 12.9233 49.5528 13.07C49.4595 13.21 49.4128 13.37 49.4128 13.55C49.4128 13.7567 49.4828 13.9367 49.6228 14.09C49.7695 14.2433 50.0395 14.3633 50.4328 14.45L51.7728 14.75C52.4128 14.89 52.8661 15.1033 53.1328 15.39C53.3995 15.6767 53.5328 16.04 53.5328 16.48C53.5328 16.8867 53.4228 17.24 53.2028 17.54C52.9828 17.84 52.6761 18.07 52.2828 18.23C51.8961 18.39 51.4395 18.47 50.9128 18.47C50.4461 18.47 50.0261 18.41 49.6528 18.29C49.2795 18.17 48.9528 18.0067 48.6728 17.8C48.3928 17.5933 48.1628 17.3567 47.9828 17.09L48.7228 16.35C48.8628 16.5833 49.0395 16.7933 49.2528 16.98C49.4661 17.16 49.7128 17.3 49.9928 17.4C50.2795 17.5 50.5961 17.55 50.9428 17.55C51.2495 17.55 51.5128 17.5133 51.7328 17.44C51.9595 17.3667 52.1295 17.26 52.2428 17.12C52.3628 16.9733 52.4228 16.8 52.4228 16.6C52.4228 16.4067 52.3561 16.2367 52.2228 16.09C52.0961 15.9433 51.8561 15.83 51.5028 15.75L50.0528 15.42C49.6528 15.3333 49.3228 15.21 49.0628 15.05C48.8028 14.89 48.6095 14.6967 48.4828 14.47C48.3561 14.2367 48.2928 13.9767 48.2928 13.69C48.2928 13.3167 48.3928 12.98 48.5928 12.68C48.7995 12.3733 49.0961 12.13 49.4828 11.95C49.8695 11.7633 50.3295 11.67 50.8628 11.67Z"></path>
<path d="M55.0288 18.37V11.77H59.8088V12.69H56.0988V14.59H58.9988V15.49H56.0988V17.45H59.9488V18.37H55.0288Z"></path>
<path d="M63.9491 18.47C63.3291 18.47 62.7924 18.3333 62.3391 18.06C61.8857 17.7867 61.5324 17.4 61.2791 16.9C61.0257 16.3933 60.8991 15.7833 60.8991 15.07C60.8991 14.37 61.0291 13.7667 61.2891 13.26C61.5557 12.7533 61.9291 12.3633 62.4091 12.09C62.8957 11.81 63.4524 11.67 64.0791 11.67C64.7657 11.67 65.3191 11.7967 65.7391 12.05C66.1657 12.3033 66.5057 12.6967 66.7591 13.23L65.7691 13.7C65.6424 13.3333 65.4324 13.06 65.1391 12.88C64.8524 12.6933 64.5024 12.6 64.0891 12.6C63.6757 12.6 63.3124 12.6967 62.9991 12.89C62.6924 13.0833 62.4524 13.3667 62.2791 13.74C62.1057 14.1067 62.0191 14.55 62.0191 15.07C62.0191 15.5967 62.0957 16.0467 62.2491 16.42C62.4024 16.7867 62.6324 17.0667 62.9391 17.26C63.2524 17.4533 63.6357 17.55 64.0891 17.55C64.3357 17.55 64.5657 17.52 64.7791 17.46C64.9924 17.3933 65.1791 17.3 65.3391 17.18C65.4991 17.0533 65.6224 16.8967 65.7091 16.71C65.8024 16.5167 65.8491 16.29 65.8491 16.03V15.84H63.9291V14.97H66.7991V18.37H65.9991L65.9391 17.04L66.1391 17.14C65.9791 17.56 65.7124 17.8867 65.3391 18.12C64.9724 18.3533 64.5091 18.47 63.9491 18.47Z"></path>
<path d="M73.7654 11.77V15.84C73.7654 16.7133 73.5354 17.37 73.0754 17.81C72.6154 18.25 71.9454 18.47 71.0654 18.47C70.1987 18.47 69.5321 18.25 69.0654 17.81C68.6054 17.37 68.3754 16.7133 68.3754 15.84V11.77H69.4454V15.71C69.4454 16.33 69.5787 16.79 69.8454 17.09C70.112 17.39 70.5187 17.54 71.0654 17.54C71.6187 17.54 72.0287 17.39 72.2954 17.09C72.5621 16.79 72.6954 16.33 72.6954 15.71V11.77H73.7654Z"></path>
<path d="M78.2852 11.77C78.9919 11.77 79.5519 11.9467 79.9652 12.3C80.3852 12.6533 80.5952 13.13 80.5952 13.73C80.5952 14.35 80.3852 14.83 79.9652 15.17C79.5519 15.5033 78.9919 15.67 78.2852 15.67L78.1852 15.73H76.6552V18.37H75.5952V11.77H78.2852ZM78.2052 14.84C78.6386 14.84 78.9586 14.7533 79.1652 14.58C79.3786 14.4 79.4852 14.1267 79.4852 13.76C79.4852 13.4 79.3786 13.13 79.1652 12.95C78.9586 12.77 78.6386 12.68 78.2052 12.68H76.6552V14.84H78.2052ZM78.8352 15.06L80.9852 18.37H79.7552L77.9152 15.48L78.8352 15.06Z"></path>
<path d="M84.9954 11.67C85.6354 11.67 86.1887 11.8067 86.6554 12.08C87.122 12.3533 87.482 12.7433 87.7354 13.25C87.9887 13.7567 88.1154 14.3633 88.1154 15.07C88.1154 15.7767 87.9887 16.3833 87.7354 16.89C87.482 17.3967 87.122 17.7867 86.6554 18.06C86.1887 18.3333 85.6354 18.47 84.9954 18.47C84.3621 18.47 83.812 18.3333 83.3454 18.06C82.8787 17.7867 82.5187 17.3967 82.2654 16.89C82.0121 16.3833 81.8854 15.7767 81.8854 15.07C81.8854 14.3633 82.0121 13.7567 82.2654 13.25C82.5187 12.7433 82.8787 12.3533 83.3454 12.08C83.812 11.8067 84.3621 11.67 84.9954 11.67ZM84.9954 12.6C84.5821 12.6 84.2254 12.6967 83.9254 12.89C83.6321 13.0833 83.4054 13.3633 83.2454 13.73C83.0854 14.0967 83.0054 14.5433 83.0054 15.07C83.0054 15.59 83.0854 16.0367 83.2454 16.41C83.4054 16.7767 83.6321 17.0567 83.9254 17.25C84.2254 17.4433 84.5821 17.54 84.9954 17.54C85.4154 17.54 85.7721 17.4433 86.0654 17.25C86.3654 17.0567 86.5954 16.7767 86.7554 16.41C86.9154 16.0367 86.9954 15.59 86.9954 15.07C86.9954 14.5433 86.9154 14.0967 86.7554 13.73C86.5954 13.3633 86.3654 13.0833 86.0654 12.89C85.7721 12.6967 85.4154 12.6 84.9954 12.6Z"></path>
</svg></span>

  <img loading="eager" src="https://cdn.prod.website-files.com/65c1399ac999a342139b5069/65c1399ac999a342139b5434_logo_brlc_preto.svg" alt="Logo InfinitePay" class="img-logo_infinitepay w-variant-c74a8267-4291-3686-2047-6a4b3b9bb8fa is-responsive">

  <div class="h-stack gap-2 wrap justify-center we-accept">
              

              
                  <img src="//lojaforllini.com/cdn/shop/t/3/assets/visa.svg?v=45599026668453523871775479115" alt="Visa" width="50px" height="32.5px" loading="lazy">
                  <img src="//lojaforllini.com/cdn/shop/t/3/assets/mastercard.svg?v=160938071474273240401775479115" alt="Mastercard" width="50px" height="32.5px" loading="lazy">
                  <img src="//lojaforllini.com/cdn/shop/t/3/assets/card-3.svg?v=162045016899304588751775479115" alt="DinnerClub" width="50px" height="32.5px" loading="lazy">
                  <img src="//lojaforllini.com/cdn/shop/t/3/assets/amex.svg?v=123052684372381709601775479115" alt="American Express" width="50px" height="32.5px" loading="lazy">
                  <img src="//lojaforllini.com/cdn/shop/t/3/assets/elo.svg?v=4282977770298183031775479115" alt="Elo" width="50px" height="32.5px" loading="lazy">
                  <img src="//lojaforllini.com/cdn/shop/t/3/assets/pix.svg?v=76197741278753254161775479115" alt="PIX" width="50px" height="32.5px" loading="lazy">
                  
              
            </div>
</div>
        </div>
      </body>
      </html>
    `);

  } catch (error) {
    console.error(error.message);
    res.status(500).send("Erro ao abrir checkout");
  }
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

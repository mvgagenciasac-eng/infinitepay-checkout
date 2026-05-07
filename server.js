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

<img 
  class="infinitepay-logo" 
  src="https://upload.wikimedia.org/wikipedia/commons/0/0c/Logo_InfinitePay.svg" 
  alt="InfinitePay"
/>

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

        <img 
  class="infinitepay-logo" 
  src="https://upload.wikimedia.org/wikipedia/commons/0/0c/Logo_InfinitePay.svg" 
  alt="InfinitePay"
/>
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
              <span class="lock">🔒</span>
              <span>Ir para o pagamento</span>
              <span class="button-divider"></span>
              <span class="infinitepay-mark">
                <span class="ip-circle"></span>
                infinitepay
              </span>
            </button>

            <div class="secure-note">
              🔒 Seus dados estão protegidos e o pagamento é 100% seguro.
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
              <span>Frete ⓘ</span>
              <span>Calculado na próxima etapa</span>
            </div>

            <div class="total-line">
              <span>Total</span>
              <span>${formatMoney(total)}</span>
            </div>

            <div class="trust-row">
              <div class="trust-left">
                <div class="shield">♢</div>
                <div class="trust-text">
                  <strong>Ambiente seguro</strong>
                  <span>Seus dados e pagamento protegidos</span>
                </div>
              </div>

              <div class="infinitepay-mark">
                <span class="ip-circle"></span>
                infinitepay
              </div>
            </div>

            <div class="divider"></div>

            <div class="payment-info">
              🔒 Pague com Pix, Cartão via InfinitePay
            </div>
          </aside>
        </main>

        <section class="benefits">
          <div class="benefit">
            <div class="benefit-icon">🔒</div>
            <div>
              <strong>Pagamento 100% Seguro</strong>
              <span>Ambiente protegido</span>
            </div>
          </div>

          <div class="benefit">
            <div class="benefit-icon">🛡️</div>
            <div>
              <strong>Privacidade Garantida</strong>
              <span>Seus dados seguros</span>
            </div>
          </div>

          <div class="benefit">
            <div class="benefit-icon">🎧</div>
            <div>
              <strong>Suporte Especializado</strong>
              <span>Atendimento rápido</span>
            </div>
          </div>

          <div class="benefit">
            <div class="benefit-icon">🏅</div>
            <div>
              <strong>Satisfação Garantida</strong>
              <span>Compra segura</span>
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
  <span>Pagamento seguro via</span>

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

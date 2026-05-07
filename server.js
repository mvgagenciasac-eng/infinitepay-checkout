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

    const itemsHtml = items.map((item) => {
      const price = Number(item.price);
      const quantity = Number(item.quantity);

      total += price * quantity;

      return `
        <div style="display:flex;gap:15px;margin-bottom:20px;padding-bottom:20px;border-bottom:1px solid #eee;">
          
          <img 
            src="${item.image}" 
            style="width:90px;height:90px;object-fit:cover;border-radius:10px;"
          />

          <div style="flex:1;">
            <h3 style="margin:0;font-size:16px;">
              ${item.title}
            </h3>

            <p style="margin:5px 0;color:#666;">
              Variante: ${item.variant_title || "Padrão"}
            </p>

            <p style="margin:5px 0;">
              Quantidade: ${quantity}
            </p>

            <strong>
              R$ ${(price * quantity).toFixed(2)}
            </strong>
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
          body{
            font-family:Arial;
            background:#f5f5f5;
            margin:0;
            padding:20px;
          }

          .container{
            max-width:700px;
            margin:auto;
            background:white;
            border-radius:20px;
            padding:30px;
          }

          .logo{
            text-align:center;
            margin-bottom:30px;
          }

          .total{
            font-size:24px;
            margin-top:20px;
          }

          .button{
            width:100%;
            height:55px;
            border:none;
            background:black;
            color:white;
            font-size:18px;
            border-radius:12px;
            cursor:pointer;
            margin-top:30px;
          }

          input{
            width:100%;
            height:50px;
            margin-top:10px;
            padding:10px;
            border:1px solid #ddd;
            border-radius:10px;
            box-sizing:border-box;
          }
        </style>
      </head>

      <body>

        <div class="container">

          <div class="logo">
            <h1>FORLLINI</h1>
          </div>

          <h2>Seu pedido</h2>

          ${itemsHtml}

          <div class="total">
            <strong>Total: R$ ${total.toFixed(2)}</strong>
          </div>

          <hr style="margin:30px 0;" />

          <h2>Dados para entrega</h2>

          <input placeholder="Nome completo" />
          <input placeholder="E-mail" />
          <input placeholder="WhatsApp" />
          <input placeholder="CPF" />
          <input placeholder="CEP" />
          <input placeholder="Endereço" />
          <input placeholder="Número" />
          <input placeholder="Bairro" />
          <input placeholder="Cidade" />
          <input placeholder="Estado" />

          <button class="button">
            Ir para pagamento
          </button>

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

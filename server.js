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

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

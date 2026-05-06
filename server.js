require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// Teste no navegador
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

    const checkoutUrl = response.data.url || response.data.checkout_url || response.data.link;

    res.redirect(checkoutUrl);

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({
      error: error.response?.data || error.message
    });
  }
});

// Criar checkout via Shopify
app.post("/create-checkout", async (req, res) => {
  try {
    const { items } = req.body;

const payload = {
  handle: process.env.INFINITE_TAG,
items: items.map(i => ({
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

    const checkoutUrl = response.data.url || response.data.checkout_url || response.data.link;

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

    if (event.status === "paid") {
      console.log("Pagamento aprovado:", event);
    }

    res.sendStatus(200);

  } catch (error) {
    console.error(error.message);
    res.sendStatus(500);
  }
});

app.get("/", (req, res) => {
  res.status(200).send("InfinitePay Checkout API online");
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// 🔹 Criar checkout InfinitePay
app.post("/create-checkout", async (req, res) => {
  try {
    const { items } = req.body;

    const payload = {
      tag: process.env.INFINITE_TAG,
      items: items.map(i => ({
        name: i.title,
        quantity: i.quantity,
        amount: Math.round(i.price * 100)
      })),
      redirect_url: process.env.SUCCESS_URL
    };

    const response = await axios.post(
      "https://api.checkout.infinitepay.io/links",
      payload
    );

    res.json({ checkout_url: response.data.url });

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).send("Erro ao criar checkout");
  }
});

// 🔹 Webhook InfinitePay
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
  res.send("InfinitePay Checkout API online");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

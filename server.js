```js
require("dotenv").config();

const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();

const savedCheckouts = {};
const checkoutSessions = {};

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
});

app.use(express.json({ limit: "10mb" }));

app.options("/create-session", (req, res) => {
  res.status(204).end();
});

app.get("/", (req, res) => {
  res.status(200).send("InfinitePay Checkout API online");
});

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
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

app.post("/create-checkout", async (req, res) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Carrinho vazio ou inválido" });
    }

    const payload = {
      handle: process.env.INFINITE_TAG,
      items: items.map((i) => ({
        description: `${i.title || "Produto"}${i.variant_title ? " - " + i.variant_title : ""}`,
        quantity: Number(i.quantity || 1),
        price: Math.round(Number(i.price || 0) * 100)
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
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

app.post("/api/create-payment", async (req, res) => {
  try {
    const { items, customer } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Carrinho vazio" });
    }

    if (!customer?.email || !customer?.phone || !customer?.name || !customer?.cpf) {
      return res.status(400).json({
        error: "Dados obrigatórios ausentes"
      });
    }

    const orderNsu = `FORLLINI-${Date.now()}`;

    const cleanPhone = String(customer.phone || "").replace(/\D/g, "");
    const phoneWithDdi = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
    const cleanCpf = String(customer.cpf || "").replace(/\D/g, "");

    const payload = {
      handle: process.env.INFINITE_TAG,
      order_nsu: orderNsu,

      items: items.map((i) => ({
        description: `${i.title || "Produto"}${i.variant_title ? " - " + i.variant_title : ""}`,
        quantity: Number(i.quantity || 1),
        price: Math.round(Number(i.price || 0) * 100)
      })),

      customer: {
        name: customer.name,
        email: customer.email,
        phone: phoneWithDdi,
        document: cleanCpf
      },

      redirect_url: process.env.SUCCESS_URL
    };

    const response = await axios.post(
      "https://api.checkout.infinitepay.io/links",
      payload
    );

    const checkoutUrl =
      response.data.url || response.data.checkout_url || response.data.link;

    savedCheckouts[orderNsu] = {
      order_nsu: orderNsu,
      items,
      customer,
      created_at: new Date().toISOString()
    };

    res.json({
      checkout_url: checkoutUrl,
      order_nsu: orderNsu
    });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

app.post("/create-session", async (req, res) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Carrinho vazio" });
    }

    const sessionId = `CHK-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    checkoutSessions[sessionId] = {
      items,
      created_at: new Date().toISOString()
    };

    res.json({
      checkout_url: `https://checkout.lojaforllini.com/checkout/${sessionId}`
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Erro ao criar sessão de checkout" });
  }
});

async function createShopifyOrder(checkoutData, paymentEvent) {
  const customer = checkoutData.customer;
  const items = checkoutData.items;

  const lineItems = items.map((item) => ({
    title: `${item.title || "Produto"}${item.variant_title ? " - " + item.variant_title : ""}`,
    quantity: Number(item.quantity || 1),
    price: Number(item.price || 0).toFixed(2)
  }));

  const cleanPhone = String(customer.phone || "").replace(/\D/g, "");
  const cleanCpf = String(customer.cpf || "").replace(/\D/g, "");
  const cleanCep = String(customer.cep || "").replace(/\D/g, "");

  const orderPayload = {
    order: {
      email: customer.email,
      financial_status: "paid",
      fulfillment_status: null,
      send_receipt: false,
      send_fulfillment_receipt: false,
      note: `Pedido pago via InfinitePay. NSU: ${checkoutData.order_nsu}`,
      tags: "InfinitePay, Checkout Próprio",

      line_items: lineItems,

      customer: {
        first_name: customer.name,
        email: customer.email,
        phone: cleanPhone
      },

      shipping_address: {
        first_name: customer.name,
        address1: customer.address,
        address2: customer.complement || "",
        phone: cleanPhone,
        city: customer.city,
        province: customer.state,
        country: "Brazil",
        zip: cleanCep
      },

      billing_address: {
        first_name: customer.name,
        address1: customer.address,
        address2: customer.complement || "",
        phone: cleanPhone,
        city: customer.city,
        province: customer.state,
        country: "Brazil",
        zip: cleanCep
      },

      transactions: [
        {
          kind: "sale",
          status: "success",
          amount: lineItems
            .reduce((total, item) => total + Number(item.price) * Number(item.quantity), 0)
            .toFixed(2),
          gateway: "InfinitePay"
        }
      ],

      note_attributes: [
        {
          name: "CPF",
          value: cleanCpf
        },
        {
          name: "InfinitePay NSU",
          value: checkoutData.order_nsu
        },
        {
          name: "Pagamento",
          value: "InfinitePay"
        }
      ]
    }
  };

  const response = await axios.post(
    `https://${process.env.SHOPIFY_STORE}/admin/api/2026-04/orders.json`,
    orderPayload,
    {
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
      }
    }
  );

  return response.data.order;
}

app.post("/webhook", async (req, res) => {
  try {
    const event = req.body;

    const status = event.status || event.payment_status || event.order_status;

    const orderNsu =
      event.order_nsu ||
      event.orderNsu ||
      event.nsu ||
      event.external_id ||
      event.reference;

    if (status === "paid" || status === "approved" || status === "completed") {
      const checkoutData = savedCheckouts[orderNsu];

      if (!checkoutData) {
        return res.sendStatus(200);
      }

      await createShopifyOrder(checkoutData, event);

      delete savedCheckouts[orderNsu];
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Erro no webhook:", error.response?.data || error.message);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
```

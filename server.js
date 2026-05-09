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
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

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
    console.error("Erro /test-checkout:", error.response?.data || error.message);
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
      checkout_url: `${process.env.APP_URL || "https://checkout.lojaforllini.com"}/checkout/${sessionId}`
    });
  } catch (error) {
    console.error("Erro /create-session:", error.message);
    res.status(500).json({ error: "Erro ao criar sessão de checkout" });
  }
});

app.post("/create-session-form", async (req, res) => {
  try {
    const items = JSON.parse(req.body.items || "[]");

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).send("Carrinho vazio");
    }

    const sessionId = `CHK-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    checkoutSessions[sessionId] = {
      items,
      created_at: new Date().toISOString()
    };

    res.redirect(`${process.env.APP_URL || "https://checkout.lojaforllini.com"}/checkout/${sessionId}`);
  } catch (error) {
    console.error("Erro /create-session-form:", error.message);
    res.status(500).send("Erro ao criar checkout");
  }
});

async function createShopifyPendingOrder(checkoutData) {
  const customer = checkoutData.customer;
  const items = checkoutData.items;

  const cleanPhone = String(customer.phone || "").replace(/\D/g, "");
  const shopifyPhone = cleanPhone.startsWith("55") ? `+${cleanPhone}` : `+55${cleanPhone}`;
  const cleanCpf = String(customer.cpf || "").replace(/\D/g, "");
  const cleanCep = String(customer.cep || "").replace(/\D/g, "");

  const fullName = customer.name || "Cliente";
  const nameParts = fullName.trim().split(" ");
  const firstName = nameParts.shift() || fullName;
  const lastName = nameParts.join(" ") || " ";

  const address1 = `${customer.address || ""}${customer.number ? ", " + customer.number : ""}`;
  const address2 = `${customer.neighborhood || ""}${customer.complement ? " - " + customer.complement : ""}`;

  const lineItems = items.map((item) => {
    if (item.variant_id) {
      return {
        variant_id: Number(item.variant_id),
        quantity: Number(item.quantity || 1)
      };
    }

    return {
      title: `${item.title || "Produto"}${item.variant_title ? " - " + item.variant_title : ""}`,
      quantity: Number(item.quantity || 1),
      price: Number(item.price || 0).toFixed(2)
    };
  });

  const orderPayload = {
    order: {
      email: customer.email,
      phone: shopifyPhone,

      financial_status: "pending",
      fulfillment_status: null,

      send_receipt: false,
      send_fulfillment_receipt: false,

      tags: "InfinitePay, Checkout Próprio, Pagamento Pendente",

      note: `Pedido iniciado no checkout próprio. Aguardando confirmação manual InfinitePay. NSU: ${checkoutData.order_nsu}`,

      line_items: lineItems,

      shipping_address: {
        first_name: firstName,
        last_name: lastName,
        name: fullName,
        address1: address1,
        address2: address2,
        phone: shopifyPhone,
        city: customer.city,
        province: customer.state,
        province_code: customer.state,
        country: "Brazil",
        country_code: "BR",
        zip: cleanCep
      },

      billing_address: {
        first_name: firstName,
        last_name: lastName,
        name: fullName,
        address1: address1,
        address2: address2,
        phone: shopifyPhone,
        city: customer.city,
        province: customer.state,
        province_code: customer.state,
        country: "Brazil",
        country_code: "BR",
        zip: cleanCep
      },

      note_attributes: [
        { name: "CPF", value: cleanCpf },
        { name: "Telefone", value: shopifyPhone },
        { name: "Endereço", value: address1 },
        { name: "Bairro", value: customer.neighborhood || "" },
        { name: "Cidade", value: customer.city || "" },
        { name: "Estado", value: customer.state || "" },
        { name: "CEP", value: cleanCep },
        { name: "InfinitePay NSU", value: checkoutData.order_nsu },
        { name: "Status", value: "Aguardando pagamento InfinitePay" }
      ]
    }
  };

  console.log("PAYLOAD SHOPIFY:", JSON.stringify(orderPayload, null, 2));

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
const phoneWithDdi = cleanPhone.startsWith("55")
  ? cleanPhone
  : `55${cleanPhone}`;

   const payload = {
  handle: process.env.INFINITE_TAG,

  redirect_url: process.env.SUCCESS_URL,

  webhook_url: `${process.env.APP_URL}/webhook`,

  order_nsu: orderNsu,

  items: items.map((i) => ({
    description: `${i.title || "Produto"}${i.variant_title ? " - " + i.variant_title : ""}`,
    quantity: Number(i.quantity || 1),
    price: Math.round(Number(i.price || 0) * 100)
  })),

  customer: {
    name: customer.name,
    email: customer.email,
    phone: phoneWithDdi
  }
};

    console.log("Order NSU:", orderNsu);
    console.log("Payload InfinitePay:", JSON.stringify(payload, null, 2));

    const response = await axios.post(
      "https://api.checkout.infinitepay.io/links",
      payload
    );

    const checkoutUrl =
      response.data.url || response.data.checkout_url || response.data.link;

    if (!checkoutUrl) {
      console.error("Resposta InfinitePay sem checkout_url:", response.data);
      return res.status(500).json({
        error: "InfinitePay não retornou URL de pagamento",
        details: response.data
      });
    }

    const checkoutData = {
      order_nsu: orderNsu,
      items,
      customer,
      checkout_url: checkoutUrl,
      created_at: new Date().toISOString()
    };

    savedCheckouts[orderNsu] = checkoutData;

    console.log("CHECKOUT SALVO:", orderNsu);

    let shopifyOrder = null;

try {
  shopifyOrder = await createShopifyPendingOrder(checkoutData);

  console.log("PEDIDO PENDENTE CRIADO NA SHOPIFY:", shopifyOrder.id);
} catch (shopifyError) {
  console.error("ERRO AO CRIAR PEDIDO SHOPIFY:");
  console.error(JSON.stringify(shopifyError.response?.data || shopifyError.message, null, 2));
}

res.json({
  checkout_url: checkoutUrl,
  order_nsu: orderNsu,
  shopify_order_id: shopifyOrder ? shopifyOrder.id : null
});
  } catch (error) {
    console.error("Erro /api/create-payment:", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});
app.get("/checkout/:sessionId", async (req, res) => {
  try {
    const session = checkoutSessions[req.params.sessionId];

    if (!session) {
      return res.status(404).send("Checkout expirado ou não encontrado");
    }

    const { items } = session;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).send("Carrinho vazio");
    }

    const formatMoney = (value) => {
      return Number(value).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
      });
    };

    let total = 0;

    const safeItems = items.map((item) => {
      const price = Number(item.price || 0);
      const quantity = Number(item.quantity || 1);
      const itemTotal = price * quantity;

      total += itemTotal;

      return {
  product_id: item.product_id || null,
  variant_id: item.variant_id || null,
  sku: item.sku || "",
  title: item.title || "Produto",
  variant_title: item.variant_title || "Padrão",
  quantity,
  price,
  image: item.image || "",
  itemTotal
};
    });

    const itemsHtml = safeItems.map((item) => {
      return `
        <div class="order-item">
          <div class="product-image-wrap">
            ${
              item.image
                ? `<img src="${item.image}" class="product-image" alt="${item.title}" />`
                : `<div class="no-image">📦</div>`
            }
            <span class="qty-badge">${item.quantity}</span>
          </div>

          <div class="product-info">
            <strong>${item.title}</strong>
            <span>${item.variant_title}</span>
          </div>

          <div class="product-price">${formatMoney(item.itemTotal)}</div>
        </div>
      `;
    }).join("");

    res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-4MVQ95824Y"></script>

<script>
window.dataLayer = window.dataLayer || [];

function gtag(){
  dataLayer.push(arguments);
}

gtag('js', new Date());

gtag('config', 'G-4MVQ95824Y');

gtag('config', 'AW-18025145804');

gtag('event', 'conversion', {
  'send_to': 'AW-18025145804/pV3TCPHW86YcEMzLh5ND',
  'value': 0.0,
  'currency': 'BRL'
});
</script>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Checkout Forllini</title>

<style>

.checkout-explanation{
  padding:44px;
  background:#fff;
  border-top:1px solid #e5e5e5;
}

.checkout-explanation h2{
  text-align:center;
  font-size:24px;
  margin:0 0 28px;
}

.explanation-grid{
  display:grid;
  grid-template-columns:repeat(4,1fr);
  gap:18px;
}

.explanation-card{
  background:#fafafa;
  border:1px solid #e5e5e5;
  border-radius:12px;
  padding:20px;
}

.explanation-card strong{
  display:block;
  font-size:15px;
  margin-bottom:10px;
}

.explanation-card span{
  display:block;
  font-size:14px;
  line-height:1.55;
  color:#444;
}

@media(max-width:900px){
  .checkout-explanation{
    padding:36px 18px;
  }

  .explanation-grid{
    grid-template-columns:1fr;
  }
}

*{box-sizing:border-box}
body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff}
.header{text-align:center;padding:28px 20px 24px;border-bottom:1px solid #e5e5e5}
.brand{font-family:Georgia,'Times New Roman',serif;font-size:42px;letter-spacing:4px;line-height:1;font-weight:400}
.subtitle{margin-top:4px;font-size:11px;letter-spacing:2px;color:#666}
.checkout{display:grid;grid-template-columns:1.1fr .9fr;min-height:720px}
.left{padding:38px 44px}
.right{background:#f7f7f7;padding:38px 44px;border-left:1px solid #e5e5e5}
.steps{display:flex;gap:10px;align-items:center;color:#777;font-size:14px;margin-bottom:30px}
.steps strong{color:#111}
h2{font-size:18px;margin:0 0 14px}
.section-title{display:flex;justify-content:space-between;align-items:center}
.login-text{font-size:14px;color:#555}
.login-text a{color:#1769e0;text-decoration:none}
.field{width:100%;height:46px;border:1px solid #d9d9d9;border-radius:5px;padding:0 12px;font-size:14px;outline:none;background:#fff}
.field:focus{border-color:#111}
.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.field-group{display:flex;flex-direction:column;gap:12px;margin-bottom:28px}
.checkbox-line{display:flex;align-items:center;gap:10px;font-size:14px;margin:14px 0 28px}
.checkbox-line input{width:17px;height:17px}
.pay-button{width:100%;height:52px;border:none;background:#000;color:#fff;border-radius:6px;font-size:16px;font-weight:600;cursor:pointer;display:flex;justify-content:center;align-items:center;gap:14px;margin-top:18px}
.pay-button:hover{opacity:.9}
.infinitepay-logo{height:23px;width:auto;display:inline-block}
.infinitepay-logo.small{height:18px}
.secure-note{display:flex;justify-content:center;align-items:center;gap:8px;color:#777;font-size:13px;margin-top:18px}
.order-item{display:grid;grid-template-columns:82px 1fr auto;gap:16px;align-items:center;margin-bottom:24px}
.product-image-wrap{position:relative;width:82px;height:82px;background:#fff;border:1px solid #ddd;border-radius:8px;display:flex;align-items:center;justify-content:center}
.product-image{width:74px;height:74px;object-fit:cover;border-radius:6px}
.no-image{font-size:28px;color:#aaa}
.qty-badge{position:absolute;top:-10px;right:-10px;background:#666;color:#fff;width:26px;height:26px;border-radius:50%;font-size:14px;display:flex;align-items:center;justify-content:center;font-weight:bold}
.product-info{display:flex;flex-direction:column;gap:7px;font-size:14px;line-height:1.35}
.product-info span{color:#666}
.product-price{font-weight:bold;font-size:15px;white-space:nowrap}
.summary-line{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;font-size:15px}
.summary-line.muted{color:#666}
.total-line{display:flex;justify-content:space-between;align-items:center;margin:26px 0 32px;font-size:24px;font-weight:800}
.divider{border-top:1px solid #ddd;margin:26px 0}
.trust-row{display:flex;justify-content:space-between;align-items:center;gap:20px;margin:24px 0}
.trust-left{display:flex;align-items:center;gap:12px}
.shield{color:#10a53a;font-size:24px}
.trust-text strong{display:block;font-size:14px}
.payment-info{display:flex;align-items:center;gap:10px;color:#666;font-size:14px}
.reviews{padding:44px;background:#fff;border-top:1px solid #e5e5e5}
.reviews-title{text-align:center;font-size:24px;margin-bottom:28px}
.reviews-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
.review-card{background:#fafafa;border:1px solid #e5e5e5;border-radius:12px;padding:20px}
.review-card p{font-size:14px;line-height:1.55;color:#444;margin:12px 0 16px}
.review-card strong{display:block;font-size:14px}
.review-card span{font-size:13px;color:#777}
.stars{color:#ffb400;font-size:16px;letter-spacing:1px}
.footer{display:grid;grid-template-columns:2fr 1fr 1fr;gap:30px;padding:34px 44px;background:#fafafa;border-top:1px solid #e5e5e5}
.footer h3{margin:0 0 14px;font-size:17px}
.footer p,.footer a{display:block;color:#444;font-size:14px;line-height:1.7;text-decoration:none;margin:0}
.copyright{display:flex;justify-content:space-between;align-items:center;padding:18px 44px;font-size:13px;color:#666;border-top:1px solid #e5e5e5}
.footer-payment{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}
.card-flags{display:flex;align-items:center;gap:6px;width:100%;justify-content:flex-end;margin-top:6px}
.card-flags img{height:22px;width:auto;display:block}
@media(max-width:900px){
  .brand{font-size:38px}
  .checkout{grid-template-columns:1fr}
  .right{border-left:none;border-top:1px solid #e5e5e5}
  .left,.right{padding:28px 18px}
  .grid-2{grid-template-columns:1fr}
  .reviews{padding:36px 18px}
  .reviews-grid{grid-template-columns:1fr}
  .footer{grid-template-columns:1fr;padding:28px 18px}
  .copyright{flex-direction:column;gap:12px;padding:20px 18px;text-align:center}
  .footer-payment{justify-content:center}
  .card-flags{justify-content:center}
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
  <strong>Dados para envio</strong>
  <span>›</span>
  <span>Pagamento seguro via InfinitePay</span>
</div>

    <div class="section-title">
      <h2>Dados para pagamento e entrega</h2>
      <div class="login-text">Já possui uma conta? <a href="https://lojaforllini.com/account/login">Entrar</a></div>
    </div>

    <div class="field-group">
      <input class="field" id="customer-email" placeholder="E-mail" />
      <input class="field" id="customer-phone" placeholder="WhatsApp / Telefone" />
    </div>

    <label class="checkbox-line">
      <input type="checkbox" />
      Quero receber novidades e ofertas exclusivas
    </label>

   <h2>Dados do cliente</h2>

<div class="field-group">
  <input class="field" id="customer-name" placeholder="Nome completo" />
</div>

    <label class="checkbox-line">
      <input type="checkbox" />
      Salvar minhas informações para a próxima compra
    </label>

    <button class="pay-button" onclick="goToInfinitePay()">
      <span>Continuar para pagamento seguro InfinitePay</span>
    </button>

    <div class="secure-note">
       <img class="infinitepay-logo" src="https://upload.wikimedia.org/wikipedia/commons/0/0c/Logo_InfinitePay.svg" alt="InfinitePay" />
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
      <span>Frete Grátis 🚚</span>
      <span>8 a 12 dias úteis</span>
    </div>

    <div class="total-line">
      <span>Total</span>
      <span>${formatMoney(total)}</span>
    </div>

    <div class="trust-row">
      <div class="trust-left">
        <div class="shield">🛡️</div>
        <div class="trust-text">
          <strong>Ambiente seguro</strong>
        </div>
      </div>

      <img class="infinitepay-logo" src="https://upload.wikimedia.org/wikipedia/commons/0/0c/Logo_InfinitePay.svg" alt="InfinitePay" />
    </div>

    <div class="divider"></div>

    <div class="payment-info">
      🔒 Pague com Pix, Cartão ou Boleto via InfinitePay
    </div>
  </aside>
</main>

<section class="checkout-explanation">
  <h2>Como funciona sua compra</h2>

  <div class="explanation-grid">
    <div class="explanation-card">
      <strong>1. Escolha seu produto</strong>
      <span>Selecione seu produto Forllini e avance para o checkout.</span>
    </div>

    <div class="explanation-card">
      <strong>2. Informe seus dados</strong>
      <span>Preencha seus dados de contato e endereço de envio.</span>
    </div>

    <div class="explanation-card">
      <strong>3. Pedido registrado</strong>
      <span>Recebemos seu pedido na loja e você segue para o pagamento seguro.</span>
    </div>

    <div class="explanation-card">
      <strong>4. Pagamento InfinitePay</strong>
      <span>Finalize com Pix ou cartão no ambiente seguro da InfinitePay.</span>
    </div>
  </div>
</section>

<section class="reviews">
  <h2 class="reviews-title">Avaliações de clientes</h2>

  <div class="reviews-grid">
    <div class="review-card">
      <div class="stars">★★★★★</div>
      <p>“Produto chegou rápido e a qualidade superou minhas expectativas.”</p>
      <strong>Marcos Vinícius</strong>
      <span>São Paulo - SP</span>
    </div>

    <div class="review-card">
      <div class="stars">★★★★★</div>
      <p>“Processo de compra muito simples e pagamento aprovado na hora.”</p>
      <strong>Felipe Andrade</strong>
      <span>Rio de Janeiro - RJ</span>
    </div>

    <div class="review-card">
      <div class="stars">★★★★★</div>
      <p>“Atendimento excelente e produto exatamente como nas fotos.”</p>
      <strong>Lucas Martins</strong>
      <span>Belo Horizonte - MG</span>
    </div>

    <div class="review-card">
      <div class="stars">★★★★★</div>
      <p>“Com certeza voltarei a comprar. Loja muito confiável.”</p>
      <strong>Renato Alves</strong>
      <span>Curitiba - PR</span>
    </div>
  </div>
</section>

<footer class="footer">
  <div>
    <h3>Loja Forllini</h3>
    <p>✉️ sac@lojaforllini.com</p>
    <p>📍 Avenida Dom Hélder Câmara 05200, Sal 423,<br>20771-004 Rio de Janeiro RJ, Brasil</p>
  </div>

  <div>
    <h3>Institucional</h3>
    <a href="https://lojaforllini.com/policies/privacy-policy">Política de Privacidade</a>
    <a href="https://lojaforllini.com/policies/refund-policy">Política de Devolução</a>
    <a href="https://lojaforllini.com/policies/shipping-policy">Política de Frete</a>
    <a href="https://lojaforllini.com/policies/terms-of-service">Termos de Serviço</a>
  </div>

  <div>
    <h3>Atendimento</h3>
    <a href="https://lojaforllini.com/pages/contact">Fale conosco</a>
  </div>
</footer>

<div class="copyright">
  <span>© 2024 Loja Forllini. Todos os direitos reservados.</span>

  <div class="footer-payment">
    <span>Pagamento seguro via</span>
    <img class="infinitepay-logo small" src="https://upload.wikimedia.org/wikipedia/commons/0/0c/Logo_InfinitePay.svg" alt="InfinitePay" />

    <div class="card-flags">
      <img src="https://lojaforllini.com/cdn/shop/t/3/assets/visa.svg?v=45599026668453523871775479115" alt="Visa" />
      <img src="https://lojaforllini.com/cdn/shop/t/3/assets/mastercard.svg?v=160938071474273240401775479115" alt="Mastercard" />
      <img src="https://lojaforllini.com/cdn/shop/t/3/assets/card-3.svg?v=162045016899304588751775479115" alt="Cartão" />
      <img src="https://lojaforllini.com/cdn/shop/t/3/assets/amex.svg?v=123052684372381709601775479115" alt="Amex" />
      <img src="https://lojaforllini.com/cdn/shop/t/3/assets/discover.svg?v=83479973958667341501775479115" alt="Discover" />
      <img src="https://lojaforllini.com/cdn/shop/t/3/assets/hipercard.svg?v=30459296697427281681775479115" alt="Hipercard" />
      <img src="https://lojaforllini.com/cdn/shop/t/3/assets/pix.svg?v=76197741278753254161775479115" alt="Pix" />
    </div>
  </div>
</div>

<script>
const checkoutItems = ${JSON.stringify(safeItems)};

async function buscarCEP(cep) {
  cep = cep.replace(/\\D/g, "");

  if (cep.length !== 8) return;

  try {
    const response = await fetch("https://viacep.com.br/ws/" + cep + "/json/");
    const data = await response.json();

    if (data.erro) return;

    document.getElementById("customer-address").value = data.logradouro || "";
    document.getElementById("customer-neighborhood").value = data.bairro || "";
    document.getElementById("customer-city").value = data.localidade || "";
    document.getElementById("customer-state").value = data.uf || "";
  } catch (error) {
    console.error("Erro CEP:", error);
  }
}

document.getElementById("customer-cep").addEventListener("blur", (e) => {
  buscarCEP(e.target.value);
});

async function goToInfinitePay() {
  try {
    const customer = {
  email: document.getElementById("customer-email").value.trim(),
  phone: document.getElementById("customer-phone").value.trim(),
  name: document.getElementById("customer-name").value.trim()
};

    if (!customer.email || !customer.phone || !customer.name || !customer.cpf) {
      alert("Preencha nome, e-mail, telefone e CPF para continuar.");
      return;
    }

    const response = await fetch("/api/create-payment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        items: checkoutItems,
        customer: customer
      })
    });

    const data = await response.json();

    if (!data.checkout_url) {
      console.error(data);
      alert("Erro ao criar pagamento. Tente novamente.");
      return;
    }

    window.location.href = data.checkout_url;
  } catch (error) {
    console.error(error);
    alert("Erro ao ir para pagamento.");
  }
}
</script>

</body>
</html>
    `);
  } catch (error) {
    console.error("Erro /checkout:", error.message);
    res.status(500).send("Erro ao abrir checkout");
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

  const fullAddress = `${customer.address || ""}${customer.number ? ", " + customer.number : ""}`;

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
        address1: fullAddress,
        address2: customer.complement || "",
        phone: cleanPhone,
        city: customer.city,
        province: customer.state,
        country: "Brazil",
        zip: cleanCep
      },

      billing_address: {
        first_name: customer.name,
        address1: fullAddress,
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

    console.log("Webhook InfinitePay recebido:", JSON.stringify(event, null, 2));

    const status = event.status || event.payment_status || event.order_status;

    const orderNsu =
      event.order_nsu ||
      event.orderNsu ||
      event.nsu ||
      event.external_id ||
      event.reference ||
      event.order?.order_nsu ||
      event.order?.nsu;

    if (status === "paid" || status === "approved" || status === "completed") {
      console.log("Pagamento aprovado:", orderNsu);

      const checkoutData = savedCheckouts[orderNsu];

      if (!checkoutData) {
        console.log("Checkout não encontrado para NSU:", orderNsu);
        return res.sendStatus(200);
      }

      const shopifyOrder = await createShopifyOrder(checkoutData, event);

      console.log("Pedido Shopify criado:", shopifyOrder.id);

      delete savedCheckouts[orderNsu];
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Erro no webhook:", error.response?.data || error.message);
    res.sendStatus(500);
  }
});

app.get("/debug-saved-checkouts", (req, res) => {
  res.json({
    total: Object.keys(savedCheckouts).length,
    checkouts: savedCheckouts
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

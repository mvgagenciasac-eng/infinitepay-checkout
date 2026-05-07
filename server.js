require("dotenv").config();

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Página inicial
app.get("/", (req, res) => {
  res.status(200).send("InfinitePay Checkout API online");
});

// Teste InfinitePay
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

// Checkout antigo direto
app.post("/create-checkout", async (req, res) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Carrinho vazio ou inválido" });
    }

    const payload = {
      handle: process.env.INFINITE_TAG,
      items: items.map((i) => ({
        description: i.title,
        quantity: Number(i.quantity),
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
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Criar pagamento InfinitePay pelo checkout próprio
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
const cleanCep = String(customer.cep || "").replace(/\D/g, "");

    const payload = {
  handle: process.env.INFINITE_TAG,

  order_nsu: orderNsu,

  items: items.map((i) => ({
    description: `${i.title}${i.variant_title ? " - " + i.variant_title : ""}`,
    quantity: Number(i.quantity),
    price: Math.round(Number(i.price) * 100)
  })),

 customer: {
  name: customer.name,
  email: customer.email,
  phone: phoneWithDdi,
  document: cleanCpf,
  cpf: cleanCpf,
  shipping_address: {
  zipcode: cleanCep,
  street: customer.address,
  number: customer.number,
  complement: customer.complement,
  neighborhood: customer.neighborhood,
  city: customer.city,
  state: customer.state,
  country: "BR"
  }
},

  redirect_url: process.env.SUCCESS_URL
};

    console.log("Order NSU:", orderNsu);
    console.log("Cliente:", customer);
    console.log("Payload InfinitePay:", payload);

    const response = await axios.post(
      "https://api.checkout.infinitepay.io/links",
      payload
    );

    const checkoutUrl =
      response.data.url || response.data.checkout_url || response.data.link;

    res.json({
      checkout_url: checkoutUrl,
      order_nsu: orderNsu
    });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Checkout visual próprio
app.post("/checkout", async (req, res) => {
  try {
    const { items } = req.body;

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
      const price = Number(item.price);
      const quantity = Number(item.quantity);
      const itemTotal = price * quantity;

      total += itemTotal;

      return {
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
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Checkout Forllini</title>

<style>
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
.button-divider{width:1px;height:26px;background:rgba(255,255,255,.35)}
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
      <strong>Informações</strong>
      <span>›</span>
      <span>Pagamento</span>
    </div>

    <div class="section-title">
      <h2>Contato</h2>
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

    <h2>Entrega</h2>

    <div class="field-group">
      <select class="field" id="customer-country">
        <option>Brasil</option>
      </select>

      <div class="grid-2">
        <input class="field" id="customer-name" placeholder="Nome completo" />
        <input class="field" id="customer-cpf" placeholder="CPF" />
      </div>

      <input class="field" id="customer-cep" placeholder="CEP" />
      <input class="field" id="customer-address" placeholder="Endereço" />

      <div class="grid-2">
        <input class="field" id="customer-number" placeholder="Número" />
        <input class="field" id="customer-complement" placeholder="Complemento (opcional)" />
      </div>

      <input class="field" id="customer-neighborhood" placeholder="Bairro" />

      <div class="grid-2">
        <input class="field" id="customer-city" placeholder="Cidade" />
        <select class="field" id="customer-state">
          <option value="">Estado</option>
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

    <button class="pay-button" onclick="goToInfinitePay()">
      <span>Ir para o pagamento</span>
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
  cep = cep.replace(/\D/g, "");

  if (cep.length !== 8) return;

  try {
    const response = await fetch(
      "https://viacep.com.br/ws/" + cep + "/json/"
    );

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
      name: document.getElementById("customer-name").value.trim(),
      cpf: document.getElementById("customer-cpf").value.trim(),
      cep: document.getElementById("customer-cep").value.trim(),
      address: document.getElementById("customer-address").value.trim(),
      number: document.getElementById("customer-number").value.trim(),
      complement: document.getElementById("customer-complement").value.trim(),
      neighborhood: document.getElementById("customer-neighborhood").value.trim(),
      city: document.getElementById("customer-city").value.trim(),
      state: document.getElementById("customer-state").value
    };

    if (!customer.email || !customer.phone || !customer.name || !customer.cpf) {
      alert("Preencha nome, e-mail, telefone e CPF para continuar.");
      return;
    }

    const response = await fetch(
  "https://checkout.lojaforllini.com/api/create-payment", {
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
    console.error(error.message);
    res.status(500).send("Erro ao abrir checkout");
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

// OAuth Shopify
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
  console.log("Servidor rodando na porta " + PORT);
});

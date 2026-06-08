from fastapi import FastAPI, APIRouter, HTTPException, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, logging, uuid, secrets, re
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import httpx, bcrypt, jwt

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
JWT_SECRET = os.environ.get("JWT_SECRET", "denfert-2026")

app = FastAPI(title="Pizza Denfert API")
api = APIRouter(prefix="/api")
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("denfert")

def now(): return datetime.now(timezone.utc)
def hp(p): return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()
def cp(p, h):
    try: return bcrypt.checkpw(p.encode(), h.encode())
    except: return False
def mkjwt(uid): return jwt.encode({"sub": uid, "exp": now() + timedelta(days=30)}, JWT_SECRET, algorithm="HS256")

class RegIn(BaseModel):
    email: EmailStr; password: str; name: str
class LogIn(BaseModel):
    email: EmailStr; password: str
class GSession(BaseModel):
    session_id: str
class OtpRequestIn(BaseModel):
    phone: str
    name: Optional[str] = None
class OtpVerifyIn(BaseModel):
    phone: str
    code: str
    name: Optional[str] = None
class ResIn(BaseModel):
    date: str; time: str; guests: int; name: str; phone: str; notes: Optional[str] = None
class PurchaseIn(BaseModel):
    pizza_count: int = 1  # admin records pizza purchase for loyalty
class RedeemIn(BaseModel):
    reward: str  # "coffee" | "dessert" | "margherita"
class ScanIn(BaseModel):
    qr_data: str  # PIZZA-DENFERT:{user_id}:{qr_token}
class AdminPizzaIn(BaseModel):
    user_id: str
    qr_token: str
    pizza_count: int = 1
class AdminRedeemIn(BaseModel):
    user_id: str
    qr_token: str
    reward: str
class AdminSearchIn(BaseModel):
    query: str  # phone or name
class CreateStaffIn(BaseModel):
    phone: str
    name: str
    role: str = "staff"  # owner | manager | cashier | staff

async def cu(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing token")
    tok = authorization.replace("Bearer ", "", 1)
    s = await db.user_sessions.find_one({"session_token": tok}, {"_id": 0})
    if s:
        exp = s.get("expires_at")
        if exp and exp.tzinfo is None: exp = exp.replace(tzinfo=timezone.utc)
        if exp and exp > now():
            u = await db.users.find_one({"user_id": s["user_id"]}, {"_id": 0, "password": 0})
            if u: return u
    try:
        p = jwt.decode(tok, JWT_SECRET, algorithms=["HS256"])
        u = await db.users.find_one({"user_id": p["sub"]}, {"_id": 0, "password": 0})
        if u: return u
    except: pass
    raise HTTPException(401, "Invalid token")

# Menu: pizzas have prices_by_size, others have single price
SEED = [
    # Pizzas
    {"id": "p-margherita", "category": "pizzas", "name": "Margherita", "desc_fr": "Notre signature, simple et raffinée", "desc_en": "Our signature, simple and refined", "ingredients_fr": "Tomate San Marzano, mozzarella fior di latte, basilic frais, huile d'olive", "ingredients_en": "San Marzano tomato, fior di latte mozzarella, fresh basil, olive oil", "prices": {"26": 10.90, "31": 13.90}, "image": "https://images.pexels.com/photos/4109111/pexels-photo-4109111.jpeg?auto=compress&cs=tinysrgb&w=900"},
    {"id": "p-reine", "category": "pizzas", "name": "Reine", "desc_fr": "Le classique italien revisité", "desc_en": "The Italian classic revisited", "ingredients_fr": "Tomate, mozzarella, jambon de Savoie, champignons frais, origan", "ingredients_en": "Tomato, mozzarella, Savoie ham, fresh mushrooms, oregano", "prices": {"26": 13.50, "31": 16.50}, "image": "https://images.pexels.com/photos/2762942/pexels-photo-2762942.jpeg?auto=compress&cs=tinysrgb&w=900"},
    {"id": "p-diavola", "category": "pizzas", "name": "Diavola", "desc_fr": "Piquante et généreuse", "desc_en": "Spicy and generous", "ingredients_fr": "Tomate, mozzarella, salami piquant, oignons rouges, huile pimentée", "ingredients_en": "Tomato, mozzarella, spicy salami, red onions, chilli oil", "prices": {"26": 14.50, "31": 17.50}, "image": "https://images.pexels.com/photos/803290/pexels-photo-803290.jpeg?auto=compress&cs=tinysrgb&w=900"},
    {"id": "p-quatre", "category": "pizzas", "name": "Quatre Fromages", "desc_fr": "Un voyage fromager", "desc_en": "A cheese journey", "ingredients_fr": "Mozzarella, gorgonzola, parmesan, tomme du Rhône, basilic", "ingredients_en": "Mozzarella, gorgonzola, parmesan, Rhône tomme, basil", "prices": {"26": 14.90, "31": 17.90}, "image": "https://images.pexels.com/photos/315755/pexels-photo-315755.jpeg?auto=compress&cs=tinysrgb&w=900"},
    {"id": "p-denfert", "category": "pizzas", "name": "La Denfert", "desc_fr": "Notre création signature", "desc_en": "Our signature creation", "ingredients_fr": "Crème truffe, burrata, jambon San Daniele, roquette, parmesan", "ingredients_en": "Truffle cream, burrata, San Daniele ham, arugula, parmesan", "prices": {"26": 18.90, "31": 21.90}, "image": "https://images.pexels.com/photos/1146760/pexels-photo-1146760.jpeg?auto=compress&cs=tinysrgb&w=900"},
    {"id": "p-rhone", "category": "pizzas", "name": "Rhône-Alpes", "desc_fr": "Inspiration locale", "desc_en": "Local inspiration", "ingredients_fr": "Reblochon AOP, lardons fumés, oignons confits, pommes de terre, crème", "ingredients_en": "Reblochon AOP, smoked bacon, caramelised onions, potato, cream", "prices": {"26": 15.90, "31": 18.90}, "image": "https://images.pexels.com/photos/1049620/pexels-photo-1049620.jpeg?auto=compress&cs=tinysrgb&w=900"},
    {"id": "p-bufala", "category": "pizzas", "name": "Bufala d'Oro", "desc_fr": "L'élégance italienne", "desc_en": "Italian elegance", "ingredients_fr": "Tomate datterino jaune, mozzarella di bufala DOP, basilic, huile Ligure", "ingredients_en": "Yellow datterino tomato, buffalo mozzarella DOP, basil, Ligurian oil", "prices": {"26": 15.50, "31": 18.50}, "image": "https://images.pexels.com/photos/2619967/pexels-photo-2619967.jpeg?auto=compress&cs=tinysrgb&w=900"},
    # Focaccias
    {"id": "f-romarin", "category": "focaccias", "name": "Focaccia Romarin", "desc_fr": "Moelleuse et parfumée", "desc_en": "Soft and fragrant", "ingredients_fr": "Pâte artisanale, romarin frais, fleur de sel, huile d'olive", "ingredients_en": "Artisan dough, fresh rosemary, sea salt flakes, olive oil", "price": 6.50, "image": "https://images.pexels.com/photos/4109996/pexels-photo-4109996.jpeg?auto=compress&cs=tinysrgb&w=900"},
    {"id": "f-burrata", "category": "focaccias", "name": "Focaccia Burrata", "desc_fr": "Crémeuse à souhait", "desc_en": "Beautifully creamy", "ingredients_fr": "Focaccia, burrata, tomates cerises confites, basilic, huile d'olive", "ingredients_en": "Focaccia, burrata, candied cherry tomatoes, basil, olive oil", "price": 11.90, "image": "https://images.pexels.com/photos/1148086/pexels-photo-1148086.jpeg?auto=compress&cs=tinysrgb&w=900"},
    # Gratins
    {"id": "g-dauphinois", "category": "gratins", "name": "Gratin Dauphinois", "desc_fr": "L'âme du terroir", "desc_en": "The soul of terroir", "ingredients_fr": "Pommes de terre, crème, ail, muscade, gruyère AOP", "ingredients_en": "Potato, cream, garlic, nutmeg, gruyère AOP", "price": 9.90, "image": "https://images.pexels.com/photos/8629103/pexels-photo-8629103.jpeg?auto=compress&cs=tinysrgb&w=900"},
    {"id": "g-aubergines", "category": "gratins", "name": "Gratin d'Aubergines", "desc_fr": "Parmigiana italienne", "desc_en": "Italian parmigiana", "ingredients_fr": "Aubergines, tomate San Marzano, mozzarella, parmesan, basilic", "ingredients_en": "Aubergine, San Marzano tomato, mozzarella, parmesan, basil", "price": 11.50, "image": "https://images.pexels.com/photos/6940961/pexels-photo-6940961.jpeg?auto=compress&cs=tinysrgb&w=900"},
    # Salads
    {"id": "s-cesar", "category": "salades", "name": "César au Poulet", "desc_fr": "Le grand classique", "desc_en": "The grand classic", "ingredients_fr": "Romaine, poulet fermier, parmesan, croûtons, sauce César maison", "ingredients_en": "Romaine, free-range chicken, parmesan, croutons, house Caesar", "price": 13.50, "image": "https://images.pexels.com/photos/2097090/pexels-photo-2097090.jpeg?auto=compress&cs=tinysrgb&w=900"},
    {"id": "s-burrata", "category": "salades", "name": "Burrata & Tomates", "desc_fr": "Fraîche et raffinée", "desc_en": "Fresh and refined", "ingredients_fr": "Burrata, tomates anciennes, basilic, balsamique de Modène, fleur de sel", "ingredients_en": "Burrata, heirloom tomatoes, basil, Modena balsamic, sea salt", "price": 14.50, "image": "https://images.pexels.com/photos/8929185/pexels-photo-8929185.jpeg?auto=compress&cs=tinysrgb&w=900"},
    # Desserts
    {"id": "d-tiramisu", "category": "desserts", "name": "Tiramisu Classico", "desc_fr": "Recette traditionnelle italienne", "desc_en": "Traditional Italian recipe", "ingredients_fr": "Mascarpone, biscuits savoiardi, café espresso, cacao", "ingredients_en": "Mascarpone, savoiardi biscuits, espresso, cocoa", "price": 7.50, "image": "https://images.pexels.com/photos/6133302/pexels-photo-6133302.jpeg?auto=compress&cs=tinysrgb&w=900"},
    {"id": "d-panna", "category": "desserts", "name": "Panna Cotta Vanille", "desc_fr": "Douceur onctueuse", "desc_en": "Silky sweetness", "ingredients_fr": "Crème, vanille de Madagascar, coulis fruits rouges du Beaujolais", "ingredients_en": "Cream, Madagascar vanilla, Beaujolais red berry coulis", "price": 7.00, "image": "https://images.pexels.com/photos/4040692/pexels-photo-4040692.jpeg?auto=compress&cs=tinysrgb&w=900"},
    # Drinks
    {"id": "b-pellegrino", "category": "boissons", "name": "San Pellegrino 50cl", "desc_fr": "Eau gazeuse italienne", "desc_en": "Italian sparkling water", "ingredients_fr": "Eau minérale gazeuse", "ingredients_en": "Sparkling mineral water", "price": 4.50, "image": "https://images.pexels.com/photos/2995299/pexels-photo-2995299.jpeg?auto=compress&cs=tinysrgb&w=900"},
    {"id": "b-limonata", "category": "boissons", "name": "Limonata Sicilienne", "desc_fr": "Citrons de Sicile", "desc_en": "Sicilian lemons", "ingredients_fr": "Citrons de Sicile, sucre de canne, eau pétillante", "ingredients_en": "Sicilian lemons, cane sugar, sparkling water", "price": 4.00, "image": "https://images.pexels.com/photos/1232152/pexels-photo-1232152.jpeg?auto=compress&cs=tinysrgb&w=900"},
    {"id": "b-espresso", "category": "boissons", "name": "Espresso", "desc_fr": "Café italien single origin", "desc_en": "Italian single-origin coffee", "ingredients_fr": "Arabica 100%, torréfaction artisanale", "ingredients_en": "100% arabica, artisan roasted", "price": 2.50, "image": "https://images.pexels.com/photos/302899/pexels-photo-302899.jpeg?auto=compress&cs=tinysrgb&w=900"},
    # Wines
    {"id": "w-cotes", "category": "vins", "name": "Côtes du Rhône AOP", "desc_fr": "Rouge fruité et épicé", "desc_en": "Fruity and spicy red", "ingredients_fr": "Grenache, syrah, mourvèdre — 75cl", "ingredients_en": "Grenache, syrah, mourvèdre — 750ml", "price": 28.00, "image": "https://images.pexels.com/photos/1407846/pexels-photo-1407846.jpeg?auto=compress&cs=tinysrgb&w=900"},
    {"id": "w-chianti", "category": "vins", "name": "Chianti Classico DOCG", "desc_fr": "Toscane élégante", "desc_en": "Elegant Tuscany", "ingredients_fr": "Sangiovese 90%, Toscane — 75cl", "ingredients_en": "90% sangiovese, Tuscany — 750ml", "price": 34.00, "image": "https://images.pexels.com/photos/1407847/pexels-photo-1407847.jpeg?auto=compress&cs=tinysrgb&w=900"},
    {"id": "w-prosecco", "category": "vins", "name": "Prosecco DOC", "desc_fr": "Bulles fines de Vénétie", "desc_en": "Fine Veneto bubbles", "ingredients_fr": "Glera 100%, Vénétie — 75cl", "ingredients_en": "100% glera, Veneto — 750ml", "price": 26.00, "image": "https://images.pexels.com/photos/2664149/pexels-photo-2664149.jpeg?auto=compress&cs=tinysrgb&w=900"},
]

@app.on_event("startup")
async def startup():
    # Ensure email index is partial so multiple users with email=None / missing are allowed (phone-only OTP users).
    # NOTE: a plain `sparse` index still indexes explicit null values; only documents missing the field are
    # skipped. We need a partialFilterExpression to actually exclude null/non-string emails.
    try:
        existing = await db.users.index_information()
        if "email_1" in existing:
            opts = existing["email_1"]
            has_partial = "partialFilterExpression" in opts
            if not has_partial:
                await db.users.drop_index("email_1")
    except Exception as _e:
        log.warning(f"index check failed: {_e}")
    await db.users.create_index(
        "email",
        unique=True,
        partialFilterExpression={"email": {"$type": "string"}},
    )
    await db.users.create_index("user_id", unique=True)
    await db.users.create_index("phone", sparse=True)
    await db.user_sessions.create_index("session_token", unique=True)
    # Always replace menu on startup to reflect updates
    await db.menu.delete_many({})
    await db.menu.insert_many([dict(m) for m in SEED])
    log.info(f"Seeded {len(SEED)} menu items")
    if not await db.users.find_one({"email": "admin@pizzadenfert.fr"}):
        await db.users.insert_one({
            "user_id": "admin_" + secrets.token_hex(6),
            "email": "admin@pizzadenfert.fr", "password": hp("Admin1234!"),
            "name": "Admin", "is_admin": True,
            "pizza_count": 0, "qr_token": secrets.token_hex(12),
            "rewards_redeemed": [], "rewards_history": [],
            "created_at": now(),
        })

# Auth
@api.post("/auth/otp/request")
async def otp_request(b: OtpRequestIn):
    """Generate a 6-digit OTP for the phone. DEV MODE: returns the code in response."""
    phone = b.phone.strip().replace(" ", "")
    if len(phone) < 6:
        raise HTTPException(400, "Invalid phone")
    code = f"{secrets.randbelow(900000) + 100000}"
    await db.otp_codes.update_one(
        {"phone": phone},
        {"$set": {"phone": phone, "code": code, "expires_at": now() + timedelta(minutes=10), "created_at": now()}},
        upsert=True,
    )
    log.info(f"OTP for {phone}: {code}")
    # In production with Twilio, send SMS here. For now, return code in dev_code field.
    return {"ok": True, "phone": phone, "dev_code": code, "expires_in": 600}


@api.post("/auth/otp/verify")
async def otp_verify(b: OtpVerifyIn):
    """Verify OTP, login existing user or create new account."""
    phone = b.phone.strip().replace(" ", "")
    rec = await db.otp_codes.find_one({"phone": phone}, {"_id": 0})
    if not rec:
        raise HTTPException(400, "No code requested for this phone")
    exp = rec.get("expires_at")
    if exp and exp.tzinfo is None: exp = exp.replace(tzinfo=timezone.utc)
    if exp < now():
        raise HTTPException(400, "Code expired")
    if rec["code"] != b.code.strip():
        raise HTTPException(401, "Invalid code")
    await db.otp_codes.delete_one({"phone": phone})

    user = await db.users.find_one({"phone": phone})
    if not user:
        uid = "user_" + secrets.token_hex(6)
        user = {
            "user_id": uid, "phone": phone, "name": (b.name or phone),
            "email": None, "is_admin": False, "pizza_count": 0,
            "qr_token": secrets.token_hex(12),
            "rewards_redeemed": [], "rewards_history": [],
            "created_at": now(),
        }
        await db.users.insert_one(user)
    user.pop("_id", None); user.pop("password", None)
    return {"token": mkjwt(user["user_id"]), "user": user}


@api.post("/auth/register")
async def register(b: RegIn):
    if await db.users.find_one({"email": b.email.lower()}):
        raise HTTPException(400, "Email already registered")
    uid = "user_" + secrets.token_hex(6)
    u = {"user_id": uid, "email": b.email.lower(), "password": hp(b.password), "name": b.name,
         "is_admin": False, "pizza_count": 0, "qr_token": secrets.token_hex(12),
         "rewards_redeemed": [], "rewards_history": [], "created_at": now()}
    await db.users.insert_one(u)
    u.pop("_id", None); u.pop("password", None)
    return {"token": mkjwt(uid), "user": u}

@api.post("/auth/login")
async def login(b: LogIn):
    u = await db.users.find_one({"email": b.email.lower()})
    if not u or not cp(b.password, u.get("password", "")):
        raise HTTPException(401, "Invalid credentials")
    u.pop("_id", None); u.pop("password", None)
    return {"token": mkjwt(u["user_id"]), "user": u}

@api.post("/auth/google/session")
async def gsession(b: GSession):
    async with httpx.AsyncClient(timeout=15) as cx:
        r = await cx.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                         headers={"X-Session-ID": b.session_id})
    if r.status_code != 200: raise HTTPException(401, "Invalid session")
    d = r.json()
    email = d["email"].lower()
    u = await db.users.find_one({"email": email})
    if not u:
        uid = "user_" + secrets.token_hex(6)
        u = {"user_id": uid, "email": email, "name": d.get("name", email.split("@")[0]),
             "picture": d.get("picture"), "is_admin": False, "pizza_count": 0,
             "qr_token": secrets.token_hex(12), "rewards_redeemed": [], "rewards_history": [],
             "created_at": now()}
        await db.users.insert_one(u)
    await db.user_sessions.update_one(
        {"session_token": d["session_token"]},
        {"$set": {"session_token": d["session_token"], "user_id": u["user_id"],
                  "expires_at": now() + timedelta(days=7), "created_at": now()}},
        upsert=True,
    )
    u.pop("_id", None); u.pop("password", None)
    return {"token": d["session_token"], "user": u}

@api.get("/auth/me")
async def me(authorization: Optional[str] = Header(None)):
    u = await cu(authorization)
    u.pop("_id", None); u.pop("password", None)
    return u

@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        await db.user_sessions.delete_one({"session_token": authorization.replace("Bearer ", "", 1)})
    return {"ok": True}

# Menu (public)
@api.get("/menu")
async def menu():
    return await db.menu.find({}, {"_id": 0}).to_list(500)

# Reservations
@api.post("/reservations")
async def create_res(b: ResIn, authorization: Optional[str] = Header(None)):
    u = await cu(authorization)
    r = {"id": str(uuid.uuid4()), "user_id": u["user_id"], "user_name": u["name"],
         "user_email": u["email"], "date": b.date, "time": b.time, "guests": b.guests,
         "name": b.name, "phone": b.phone, "notes": b.notes or "", "status": "confirmed",
         "created_at": now()}
    await db.reservations.insert_one(dict(r))
    r.pop("_id", None)
    return r

@api.post("/reservations/guest")
async def guest_res(b: ResIn):
    r = {"id": str(uuid.uuid4()), "user_id": None, "user_name": b.name, "user_email": None,
         "date": b.date, "time": b.time, "guests": b.guests, "name": b.name, "phone": b.phone,
         "notes": b.notes or "", "status": "confirmed", "created_at": now()}
    await db.reservations.insert_one(dict(r))
    r.pop("_id", None)
    return r

@api.get("/reservations/me")
async def my_res(authorization: Optional[str] = Header(None)):
    u = await cu(authorization)
    return await db.reservations.find({"user_id": u["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)

# Loyalty
REWARD_THRESHOLDS = {"coffee": 3, "dessert": 5, "margherita": 10}

def _compute_available(pizza_count: int, redeemed: list) -> list:
    """List of reward keys currently claimable (threshold reached and not yet redeemed for that tier)."""
    out = []
    for key, thresh in REWARD_THRESHOLDS.items():
        # how many times threshold has been met
        earned = pizza_count // thresh
        used = sum(1 for r in redeemed if r == key)
        if earned > used:
            out.append({"reward": key, "available": earned - used})
    return out

@api.get("/loyalty/me")
async def loyalty_me(authorization: Optional[str] = Header(None)):
    u = await cu(authorization)
    pc = u.get("pizza_count", 0)
    redeemed = u.get("rewards_redeemed", [])
    return {
        "pizza_count": pc, "qr_token": u.get("qr_token"),
        "qr_data": f"PIZZA-DENFERT:{u['user_id']}:{u.get('qr_token')}",
        "name": u["name"], "email": u["email"],
        "thresholds": REWARD_THRESHOLDS,
        "available_rewards": _compute_available(pc, redeemed),
        "history": u.get("rewards_history", []),
        "next_coffee": max(0, REWARD_THRESHOLDS["coffee"] - (pc % REWARD_THRESHOLDS["coffee"])) if pc % REWARD_THRESHOLDS["coffee"] != 0 else 0,
        "next_dessert": max(0, REWARD_THRESHOLDS["dessert"] - (pc % REWARD_THRESHOLDS["dessert"])) if pc % REWARD_THRESHOLDS["dessert"] != 0 else 0,
        "next_margherita": max(0, REWARD_THRESHOLDS["margherita"] - (pc % REWARD_THRESHOLDS["margherita"])) if pc % REWARD_THRESHOLDS["margherita"] != 0 else 0,
    }

@api.post("/loyalty/add-purchase")
async def add_purchase(b: PurchaseIn, authorization: Optional[str] = Header(None)):
    """ADMIN ONLY: increment pizza count for self (deprecated for customer use)."""
    u = await cu(authorization)
    if not u.get("is_admin"):
        raise HTTPException(403, "Admin only")
    if b.pizza_count < 1 or b.pizza_count > 10:
        raise HTTPException(400, "invalid count")
    await db.users.update_one({"user_id": u["user_id"]}, {"$inc": {"pizza_count": b.pizza_count}})
    nu = await db.users.find_one({"user_id": u["user_id"]}, {"_id": 0, "password": 0})
    return {"pizza_count": nu.get("pizza_count", 0)}


async def _require_admin(authorization: Optional[str] = Header(None)) -> dict:
    u = await cu(authorization)
    if not u.get("is_admin"):
        raise HTTPException(403, "Admin only")
    return u


def _parse_qr(qr_data: str) -> tuple:
    """Parse PIZZA-DENFERT:{user_id}:{qr_token} -> (user_id, qr_token) or raise."""
    parts = qr_data.strip().split(":")
    if len(parts) != 3 or parts[0] != "PIZZA-DENFERT":
        raise HTTPException(400, "Invalid QR code")
    return parts[1], parts[2]


def _customer_payload(u: dict) -> dict:
    pc = u.get("pizza_count", 0)
    redeemed = u.get("rewards_redeemed", [])
    return {
        "user_id": u["user_id"],
        "qr_token": u.get("qr_token"),
        "name": u.get("name"),
        "email": u.get("email"),
        "pizza_count": pc,
        "available_rewards": _compute_available(pc, redeemed),
        "history": u.get("rewards_history", []),
        "thresholds": REWARD_THRESHOLDS,
        "next_coffee": (REWARD_THRESHOLDS["coffee"] - pc % REWARD_THRESHOLDS["coffee"]) % REWARD_THRESHOLDS["coffee"] or 0,
        "next_dessert": (REWARD_THRESHOLDS["dessert"] - pc % REWARD_THRESHOLDS["dessert"]) % REWARD_THRESHOLDS["dessert"] or 0,
        "next_margherita": (REWARD_THRESHOLDS["margherita"] - pc % REWARD_THRESHOLDS["margherita"]) % REWARD_THRESHOLDS["margherita"] or 0,
    }


@api.post("/admin/scan")
async def admin_scan(b: ScanIn, authorization: Optional[str] = Header(None)):
    """Admin scans customer QR code → returns customer + loyalty progress."""
    await _require_admin(authorization)
    user_id, qr_token = _parse_qr(b.qr_data)
    user = await db.users.find_one({"user_id": user_id, "qr_token": qr_token}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(404, "Customer not found or QR invalid")
    return _customer_payload(user)


@api.post("/admin/customer/add-pizza")
async def admin_add_pizza(b: AdminPizzaIn, authorization: Optional[str] = Header(None)):
    """Admin adds pizza(s) to a customer's loyalty count."""
    await _require_admin(authorization)
    if b.pizza_count < 1 or b.pizza_count > 20:
        raise HTTPException(400, "Invalid count")
    user = await db.users.find_one({"user_id": b.user_id, "qr_token": b.qr_token})
    if not user:
        raise HTTPException(404, "Customer not found")
    await db.users.update_one({"user_id": b.user_id}, {"$inc": {"pizza_count": b.pizza_count}})
    nu = await db.users.find_one({"user_id": b.user_id}, {"_id": 0, "password": 0})
    return _customer_payload(nu)


@api.post("/admin/customer/redeem")
async def admin_redeem(b: AdminRedeemIn, authorization: Optional[str] = Header(None)):
    """Admin validates a reward redemption for a customer."""
    await _require_admin(authorization)
    if b.reward not in REWARD_THRESHOLDS:
        raise HTTPException(400, "Invalid reward")
    user = await db.users.find_one({"user_id": b.user_id, "qr_token": b.qr_token})
    if not user:
        raise HTTPException(404, "Customer not found")
    avail = _compute_available(user.get("pizza_count", 0), user.get("rewards_redeemed", []))
    if not any(a["reward"] == b.reward for a in avail):
        raise HTTPException(400, "Reward not available")
    entry = {"reward": b.reward, "redeemed_at": now().isoformat()}
    await db.users.update_one(
        {"user_id": b.user_id},
        {"$push": {"rewards_redeemed": b.reward, "rewards_history": entry}},
    )
    nu = await db.users.find_one({"user_id": b.user_id}, {"_id": 0, "password": 0})
    return _customer_payload(nu)

@api.post("/loyalty/redeem")
async def redeem(b: RedeemIn, authorization: Optional[str] = Header(None)):
    u = await cu(authorization)
    if b.reward not in REWARD_THRESHOLDS:
        raise HTTPException(400, "invalid reward")
    avail = _compute_available(u.get("pizza_count", 0), u.get("rewards_redeemed", []))
    if not any(a["reward"] == b.reward for a in avail):
        raise HTTPException(400, "reward not available")
    entry = {"reward": b.reward, "redeemed_at": now().isoformat()}
    await db.users.update_one(
        {"user_id": u["user_id"]},
        {"$push": {"rewards_redeemed": b.reward, "rewards_history": entry}},
    )
    return {"ok": True, "redeemed": b.reward}

@api.post("/admin/search")
async def admin_search(b: AdminSearchIn, authorization: Optional[str] = Header(None)):
    """Search customer by phone, email or name."""
    await _require_admin(authorization)
    q = b.query.strip()
    if not q:
        return []
    # Try exact phone first
    phone_clean = q.replace(" ", "")
    # Escape user input before injecting into MongoDB $regex to avoid invalid-regex errors.
    safe_name = re.escape(q)
    safe_phone = re.escape(phone_clean)
    users = await db.users.find(
        {"$or": [
            {"phone": phone_clean},
            {"email": q.lower()},
            {"name": {"$regex": safe_name, "$options": "i"}},
            {"phone": {"$regex": safe_phone, "$options": "i"}},
        ], "is_admin": {"$ne": True}},
        {"_id": 0, "password": 0},
    ).limit(20).to_list(20)
    return [_customer_payload(u) for u in users]


@api.post("/admin/staff/create")
async def admin_create_staff(b: CreateStaffIn, authorization: Optional[str] = Header(None)):
    """Create a new admin/staff account (owner only)."""
    admin = await _require_admin(authorization)
    if admin.get("role", "owner") not in ("owner", "manager"):
        raise HTTPException(403, "Owner/manager only")
    phone = b.phone.strip().replace(" ", "")
    if await db.users.find_one({"phone": phone}):
        raise HTTPException(400, "Phone already registered")
    uid = ("admin_" if b.role in ("owner", "manager", "cashier") else "staff_") + secrets.token_hex(6)
    user = {
        "user_id": uid, "phone": phone, "name": b.name, "email": None,
        "is_admin": True, "role": b.role,
        "pizza_count": 0, "qr_token": secrets.token_hex(12),
        "rewards_redeemed": [], "rewards_history": [], "created_at": now(),
    }
    await db.users.insert_one(user)
    user.pop("_id", None)
    return {"created": user, "note": "Use phone + OTP to login as this staff member"}


@api.get("/admin/dashboard")
async def admin_dashboard(authorization: Optional[str] = Header(None)):
    """Aggregated stats for the analytics dashboard."""
    await _require_admin(authorization)
    today = now().replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = today - timedelta(days=7)
    month_ago = today - timedelta(days=30)

    async def pizzas_in_period(start):
        # Pizzas are tracked per-user. We approximate sales via rewards_history events being insufficient.
        # For now, sum users' pizza_count where last update happened in period via aggregation on user activity.
        # Simple proxy: total pizza_count across all customers (excluding admins).
        agg = await db.users.aggregate([
            {"$match": {"is_admin": {"$ne": True}}},
            {"$group": {"_id": None, "total_pizzas": {"$sum": "$pizza_count"}}},
        ]).to_list(1)
        return agg[0]["total_pizzas"] if agg else 0

    total_pizzas = await pizzas_in_period(month_ago)
    reservations_total = await db.reservations.count_documents({})
    reservations_today = await db.reservations.count_documents({"created_at": {"$gte": today}})
    reservations_week = await db.reservations.count_documents({"created_at": {"$gte": week_ago}})
    reservations_month = await db.reservations.count_documents({"created_at": {"$gte": month_ago}})
    loyalty_members = await db.users.count_documents({"is_admin": {"$ne": True}, "phone": {"$ne": None}})
    vip_count = await db.users.count_documents({"is_admin": {"$ne": True}, "pizza_count": {"$gte": 10}})

    # Redeemed rewards counts
    rewards_agg = await db.users.aggregate([
        {"$match": {"is_admin": {"$ne": True}}},
        {"$unwind": "$rewards_history"},
        {"$group": {"_id": "$rewards_history.reward", "count": {"$sum": 1}}},
    ]).to_list(10)
    redeemed = {r["_id"]: r["count"] for r in rewards_agg}

    # Top customers
    top_customers = await db.users.find(
        {"is_admin": {"$ne": True}}, {"_id": 0, "password": 0}
    ).sort("pizza_count", -1).limit(5).to_list(5)

    return {
        "total_pizzas_sold": total_pizzas,
        "loyalty_members": loyalty_members,
        "vip_customers": vip_count,
        "reservations": {
            "today": reservations_today,
            "week": reservations_week,
            "month": reservations_month,
            "total": reservations_total,
        },
        "rewards_redeemed": {
            "coffee": redeemed.get("coffee", 0),
            "dessert": redeemed.get("dessert", 0),
            "margherita": redeemed.get("margherita", 0),
            "total": sum(redeemed.values()),
        },
        "top_customers": [
            {"name": c["name"], "phone": c.get("phone"), "pizzas": c.get("pizza_count", 0)}
            for c in top_customers
        ],
    }


@api.get("/")
async def root(): return {"service": "Pizza Denfert API", "status": "ok"}

app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("shutdown")
async def shut(): client.close()

from fastapi import FastAPI, APIRouter, HTTPException, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, logging, uuid, secrets
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
class ResIn(BaseModel):
    date: str; time: str; guests: int; name: str; phone: str; notes: Optional[str] = None
class PurchaseIn(BaseModel):
    pizza_count: int = 1  # admin records pizza purchase for loyalty
class RedeemIn(BaseModel):
    reward: str  # "coffee" | "dessert" | "margherita"

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
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
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
    """Self-service demo endpoint to simulate pizza purchase (in production: admin scans QR)."""
    u = await cu(authorization)
    if b.pizza_count < 1 or b.pizza_count > 10:
        raise HTTPException(400, "invalid count")
    await db.users.update_one({"user_id": u["user_id"]}, {"$inc": {"pizza_count": b.pizza_count}})
    nu = await db.users.find_one({"user_id": u["user_id"]}, {"_id": 0, "password": 0})
    return {"pizza_count": nu.get("pizza_count", 0)}

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

@api.get("/")
async def root(): return {"service": "Pizza Denfert API", "status": "ok"}

app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("shutdown")
async def shut(): client.close()

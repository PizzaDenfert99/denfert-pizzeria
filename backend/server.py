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
JWT_SECRET = os.environ["JWT_SECRET"]

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
    zone: str = "indoor"  # "indoor" | "terrace"
class CapacityIn(BaseModel):
    indoor: int
    terrace: int
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
class UpdateRoleIn(BaseModel):
    role: str
class DisableIn(BaseModel):
    disabled: bool
class AdminPizzaInExt(BaseModel):
    user_id: str
    qr_token: str
    pizza_count: int = 1
    pizza_id: Optional[str] = None  # optional reference to menu.id for popularity tracking

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
            if u:
                if u.get("disabled"):
                    raise HTTPException(403, "Account disabled")
                return u
    try:
        p = jwt.decode(tok, JWT_SECRET, algorithms=["HS256"])
        u = await db.users.find_one({"user_id": p["sub"]}, {"_id": 0, "password": 0})
        if u:
            if u.get("disabled"):
                raise HTTPException(403, "Account disabled")
            return u
    except HTTPException:
        raise
    except Exception:
        pass
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
DEFAULT_CAPACITY = {"indoor": 30, "terrace": 20}
VALID_ZONES = ("indoor", "terrace")


async def _get_capacity() -> dict:
    """Return current per-zone seat capacity, seeding defaults on first call."""
    doc = await db.app_settings.find_one({"key": "capacity"}, {"_id": 0})
    if doc:
        return {
            "indoor": int(doc.get("indoor", DEFAULT_CAPACITY["indoor"])),
            "terrace": int(doc.get("terrace", DEFAULT_CAPACITY["terrace"])),
        }
    await db.app_settings.update_one(
        {"key": "capacity"},
        {"$set": {"key": "capacity", **DEFAULT_CAPACITY, "updated_at": now()}},
        upsert=True,
    )
    return dict(DEFAULT_CAPACITY)


async def _zone_booked(date: str, time: str, zone: str) -> int:
    """Sum of guests booked for (date, time, zone). Cancelled reservations excluded."""
    agg = await db.reservations.aggregate([
        {"$match": {"date": date, "time": time, "zone": zone, "status": {"$ne": "cancelled"}}},
        {"$group": {"_id": None, "total": {"$sum": "$guests"}}},
    ]).to_list(1)
    return int(agg[0]["total"]) if agg else 0


async def _ensure_can_book(date: str, time: str, zone: str, guests: int) -> dict:
    if zone not in VALID_ZONES:
        raise HTTPException(400, "Invalid zone")
    if guests < 1 or guests > 20:
        raise HTTPException(400, "Invalid guests")
    cap = await _get_capacity()
    booked = await _zone_booked(date, time, zone)
    if booked + guests > cap[zone]:
        raise HTTPException(409, f"Zone {zone} full for this slot")
    return cap


@api.get("/reservations/availability")
async def reservations_availability(date: str, time: str):
    """Per-zone availability for a (date, time) slot. Public — used by the reservation form."""
    cap = await _get_capacity()
    out: dict = {"date": date, "time": time, "zones": {}}
    for z in VALID_ZONES:
        booked = await _zone_booked(date, time, z)
        available = max(0, cap[z] - booked)
        out["zones"][z] = {"capacity": cap[z], "booked": booked, "available": available, "full": available <= 0}
    return out


@api.post("/reservations")
async def create_res(b: ResIn, authorization: Optional[str] = Header(None)):
    u = await cu(authorization)
    await _ensure_can_book(b.date, b.time, b.zone, b.guests)
    r = {"id": str(uuid.uuid4()), "user_id": u["user_id"], "user_name": u["name"],
         "user_email": u.get("email"), "date": b.date, "time": b.time, "guests": b.guests,
         "zone": b.zone, "name": b.name, "phone": b.phone, "notes": b.notes or "",
         "status": "confirmed", "created_at": now()}
    await db.reservations.insert_one(dict(r))
    r.pop("_id", None)
    return r

@api.post("/reservations/guest")
async def guest_res(b: ResIn):
    await _ensure_can_book(b.date, b.time, b.zone, b.guests)
    r = {"id": str(uuid.uuid4()), "user_id": None, "user_name": b.name, "user_email": None,
         "date": b.date, "time": b.time, "guests": b.guests, "zone": b.zone,
         "name": b.name, "phone": b.phone, "notes": b.notes or "",
         "status": "confirmed", "created_at": now()}
    await db.reservations.insert_one(dict(r))
    r.pop("_id", None)
    return r


@api.get("/admin/settings/capacity")
async def admin_get_capacity(authorization: Optional[str] = Header(None)):
    await _require_admin(authorization)
    return await _get_capacity()


@api.put("/admin/settings/capacity")
async def admin_update_capacity(b: CapacityIn, authorization: Optional[str] = Header(None)):
    me_admin = await _require_admin(authorization)
    _check_can_manage(me_admin)
    if b.indoor < 0 or b.indoor > 500 or b.terrace < 0 or b.terrace > 500:
        raise HTTPException(400, "Capacity must be between 0 and 500")
    await db.app_settings.update_one(
        {"key": "capacity"},
        {"$set": {"key": "capacity", "indoor": int(b.indoor), "terrace": int(b.terrace), "updated_at": now()}},
        upsert=True,
    )
    return {"indoor": int(b.indoor), "terrace": int(b.terrace)}

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
async def admin_add_pizza(b: AdminPizzaInExt, authorization: Optional[str] = Header(None)):
    """Admin adjusts a customer's loyalty pizza count.

    Positive `pizza_count` adds; negative values remove (clamped at 0).
    Logs every adjustment (including negatives) for analytics.
    """
    admin = await _require_admin(authorization)
    if b.pizza_count == 0 or b.pizza_count < -20 or b.pizza_count > 20:
        raise HTTPException(400, "Invalid count")
    user = await db.users.find_one({"user_id": b.user_id, "qr_token": b.qr_token})
    if not user:
        raise HTTPException(404, "Customer not found")
    current = int(user.get("pizza_count", 0) or 0)
    # Clamp at zero — never go below.
    effective_delta = b.pizza_count if b.pizza_count >= 0 else max(b.pizza_count, -current)
    new_count = current + effective_delta
    if effective_delta == 0:
        # Already at 0 and the admin tried to subtract → no-op, still return current payload.
        nu = await db.users.find_one({"user_id": b.user_id}, {"_id": 0, "password": 0})
        return _customer_payload(nu)
    update: dict = {"$set": {"pizza_count": new_count}}
    # If we removed pizzas, also clear over-counted rewards in `rewards_redeemed` to keep
    # the loyalty math consistent (so the customer can earn back the same tier later).
    if effective_delta < 0:
        redeemed = list(user.get("rewards_redeemed", []))
        for key, thresh in REWARD_THRESHOLDS.items():
            allowed = new_count // thresh
            used = sum(1 for r in redeemed if r == key)
            while used > allowed:
                # Remove one redemption of this key
                for i in range(len(redeemed) - 1, -1, -1):
                    if redeemed[i] == key:
                        redeemed.pop(i)
                        used -= 1
                        break
        update["$set"]["rewards_redeemed"] = redeemed
    await db.users.update_one({"user_id": b.user_id}, update)
    # Log the adjustment (positive or negative) for analytics.
    await db.pizza_events.insert_one({
        "user_id": b.user_id,
        "count": effective_delta,
        "pizza_id": b.pizza_id,
        "admin_id": admin.get("user_id"),
        "at": now(),
    })
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


@api.get("/admin/staff")
async def admin_list_staff(authorization: Optional[str] = Header(None)):
    """List all admin/staff accounts."""
    me_admin = await _require_admin(authorization)
    rows = await db.users.find(
        {"is_admin": True},
        {"_id": 0, "password": 0, "qr_token": 0, "rewards_history": 0, "rewards_redeemed": 0, "pizza_count": 0},
    ).sort("created_at", 1).to_list(200)
    out = []
    for r in rows:
        out.append({
            "user_id": r["user_id"],
            "name": r.get("name") or r.get("email") or r.get("phone"),
            "email": r.get("email"),
            "phone": r.get("phone"),
            "role": r.get("role", "owner"),
            "disabled": bool(r.get("disabled", False)),
            "is_self": r["user_id"] == me_admin["user_id"],
            "created_at": (r.get("created_at").isoformat() if r.get("created_at") else None),
        })
    return out


def _check_can_manage(actor: dict):
    if actor.get("role", "owner") not in ("owner", "manager"):
        raise HTTPException(403, "Owner/manager only")


@api.patch("/admin/staff/{user_id}/role")
async def admin_update_role(user_id: str, b: UpdateRoleIn, authorization: Optional[str] = Header(None)):
    """Update an admin user's role."""
    me_admin = await _require_admin(authorization)
    _check_can_manage(me_admin)
    if b.role not in ("owner", "manager", "cashier", "staff"):
        raise HTTPException(400, "Invalid role")
    target = await db.users.find_one({"user_id": user_id, "is_admin": True})
    if not target:
        raise HTTPException(404, "Staff not found")
    # Demoting the last owner is forbidden.
    if target.get("role", "owner") == "owner" and b.role != "owner":
        owners = await db.users.count_documents({"is_admin": True, "role": "owner"})
        if owners <= 1:
            raise HTTPException(400, "Cannot demote the last owner")
    await db.users.update_one({"user_id": user_id}, {"$set": {"role": b.role}})
    return {"ok": True, "user_id": user_id, "role": b.role}


@api.patch("/admin/staff/{user_id}/disable")
async def admin_disable_staff(user_id: str, b: DisableIn, authorization: Optional[str] = Header(None)):
    """Enable / disable a staff member. Disabled accounts cannot authenticate."""
    me_admin = await _require_admin(authorization)
    _check_can_manage(me_admin)
    if user_id == me_admin["user_id"]:
        raise HTTPException(400, "Cannot disable yourself")
    target = await db.users.find_one({"user_id": user_id, "is_admin": True})
    if not target:
        raise HTTPException(404, "Staff not found")
    # Disabling the last active owner is forbidden.
    if b.disabled and target.get("role", "owner") == "owner":
        active_owners = await db.users.count_documents({"is_admin": True, "role": "owner", "disabled": {"$ne": True}})
        if active_owners <= 1:
            raise HTTPException(400, "Cannot disable the last active owner")
    await db.users.update_one({"user_id": user_id}, {"$set": {"disabled": bool(b.disabled)}})
    if b.disabled:
        await db.user_sessions.delete_many({"user_id": user_id})
    return {"ok": True, "user_id": user_id, "disabled": bool(b.disabled)}


@api.delete("/admin/staff/{user_id}")
async def admin_delete_staff(user_id: str, authorization: Optional[str] = Header(None)):
    """Delete an admin/staff account."""
    me_admin = await _require_admin(authorization)
    _check_can_manage(me_admin)
    if user_id == me_admin["user_id"]:
        raise HTTPException(400, "Cannot delete yourself")
    target = await db.users.find_one({"user_id": user_id, "is_admin": True})
    if not target:
        raise HTTPException(404, "Staff not found")
    if target.get("role", "owner") == "owner":
        owners = await db.users.count_documents({"is_admin": True, "role": "owner"})
        if owners <= 1:
            raise HTTPException(400, "Cannot delete the last owner")
    await db.users.delete_one({"user_id": user_id})
    await db.user_sessions.delete_many({"user_id": user_id})
    return {"ok": True, "deleted": user_id}


@api.get("/admin/dashboard")
async def admin_dashboard(period: str = "all", authorization: Optional[str] = Header(None)):
    """Aggregated stats for the analytics dashboard.

    Query param `period` ∈ {today, week, month, all}.
    Falls back to `all` when value is unknown.
    """
    await _require_admin(authorization)
    today = now().replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = today - timedelta(days=7)
    month_ago = today - timedelta(days=30)

    period = (period or "all").lower()
    start = {
        "today": today,
        "week": week_ago,
        "month": month_ago,
        "all": None,
    }.get(period)
    if period not in ("today", "week", "month", "all"):
        period = "all"
        start = None

    # Pizzas sold in period (from pizza_events log). Lifetime falls back to summing users.pizza_count.
    if start is None:
        agg = await db.users.aggregate([
            {"$match": {"is_admin": {"$ne": True}}},
            {"$group": {"_id": None, "total": {"$sum": "$pizza_count"}}},
        ]).to_list(1)
        total_pizzas = int(agg[0]["total"]) if agg else 0
    else:
        agg = await db.pizza_events.aggregate([
            {"$match": {"at": {"$gte": start}}},
            {"$group": {"_id": None, "total": {"$sum": "$count"}}},
        ]).to_list(1)
        total_pizzas = int(agg[0]["total"]) if agg else 0

    # Reservations (lifetime + per period quick-lookups for context).
    reservations_total = await db.reservations.count_documents({})
    reservations_today = await db.reservations.count_documents({"created_at": {"$gte": today}})
    reservations_week = await db.reservations.count_documents({"created_at": {"$gte": week_ago}})
    reservations_month = await db.reservations.count_documents({"created_at": {"$gte": month_ago}})
    reservations_period = {
        "today": reservations_today, "week": reservations_week,
        "month": reservations_month, "all": reservations_total,
    }[period]

    loyalty_members = await db.users.count_documents({"is_admin": {"$ne": True}, "phone": {"$ne": None}})
    vip_count = await db.users.count_documents({"is_admin": {"$ne": True}, "pizza_count": {"$gte": 10}})

    # Redeemed rewards. Period filter uses rewards_history.redeemed_at if available.
    if start is None:
        rewards_agg = await db.users.aggregate([
            {"$match": {"is_admin": {"$ne": True}}},
            {"$unwind": "$rewards_history"},
            {"$group": {"_id": "$rewards_history.reward", "count": {"$sum": 1}}},
        ]).to_list(10)
    else:
        rewards_agg = await db.users.aggregate([
            {"$match": {"is_admin": {"$ne": True}}},
            {"$unwind": "$rewards_history"},
            {"$match": {"rewards_history.redeemed_at": {"$gte": start.isoformat()}}},
            {"$group": {"_id": "$rewards_history.reward", "count": {"$sum": 1}}},
        ]).to_list(10)
    redeemed = {r["_id"]: r["count"] for r in rewards_agg}

    # Top customers (lifetime — most loyal).
    top_customers = await db.users.find(
        {"is_admin": {"$ne": True}}, {"_id": 0, "password": 0}
    ).sort("pizza_count", -1).limit(5).to_list(5)

    # Top pizzas (from pizza_events with a pizza_id, joined with menu names). Period-aware.
    match_stage = {"pizza_id": {"$ne": None}}
    if start is not None:
        match_stage["at"] = {"$gte": start}
    pizza_agg = await db.pizza_events.aggregate([
        {"$match": match_stage},
        {"$group": {"_id": "$pizza_id", "total": {"$sum": "$count"}}},
        {"$sort": {"total": -1}},
        {"$limit": 5},
    ]).to_list(5)
    top_pizzas = []
    if pizza_agg:
        ids = [p["_id"] for p in pizza_agg]
        menu_rows = await db.menu.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "image": 1}).to_list(20)
        name_map = {m["id"]: m for m in menu_rows}
        for p in pizza_agg:
            m = name_map.get(p["_id"], {})
            top_pizzas.append({
                "pizza_id": p["_id"],
                "name": m.get("name") or p["_id"],
                "image": m.get("image"),
                "count": int(p["total"]),
            })

    return {
        "period": period,
        "total_pizzas_sold": total_pizzas,
        "loyalty_members": loyalty_members,
        "vip_customers": vip_count,
        "reservations_in_period": reservations_period,
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
        "top_pizzas": top_pizzas,
    }


@api.get("/")
async def root(): return {"service": "Pizza Denfert API", "status": "ok"}

app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("shutdown")
async def shut(): client.close()

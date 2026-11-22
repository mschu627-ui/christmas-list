const storageKey = "christmas-wishlist-v1";
const byId = (id) => document.getElementById(id);
const editor = byId("editor");
const form = byId("gift-form");
const fields = form.elements;
const removeDialog = byId("remove-dialog");
const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

let gifts = [];
let editing = null;
let removing = null;
let oldPhoto = "";

try {
  gifts = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
  if (!Array.isArray(gifts)) throw new Error();
} catch {
  gifts = [];
  byId("status").textContent = "The saved list could not load in this browser.";
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

function button(label, action, name) {
  const control = element("button", "", label);
  control.type = "button";
  control.setAttribute("aria-label", label + " " + name);
  control.addEventListener("click", action);
  return control;
}

function webAddress(value) {
  if (!value) return "";
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Use a link starting with https:// or http://.");
  }
  return url.href;
}

function render() {
  byId("count").textContent = gifts.length + (gifts.length === 1 ? " gift" : " gifts");
  byId("empty").hidden = gifts.length > 0;
  const cards = gifts.map((gift) => {
    const card = element("article", "card");
    if (gift.image) {
      const photo = element("img");
      photo.alt = gift.name;
      photo.loading = "lazy";
      photo.addEventListener("error", () => photo.remove());
      photo.src = gift.image;
      card.append(photo);
    }
    const body = element("div", "card-body");
    body.append(element("h3", "", gift.name));
    const details = [
      gift.size && "Size " + gift.size,
      gift.colour,
      gift.price !== "" && money.format(Number(gift.price))
    ].filter(Boolean);
    if (details.length) body.append(element("p", "details", details.join(" · ")));
    if (gift.notes) body.append(element("p", "notes", gift.notes));
    const actions = element("div", "card-actions");
    if (gift.link) {
      const link = element("a", "shop", "View item");
      link.href = gift.link;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      actions.append(link);
    }
    actions.append(
      button("Edit", () => openEditor(gift), gift.name),
      button("Remove", () => askToRemove(gift), gift.name)
    );
    body.append(actions);
    card.append(body);
    return card;
  });
  byId("gifts").replaceChildren(...cards);
}

function persist(next) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    throw new Error("Your browser could not save this change. If storage is full, try a photo link or a smaller photo.");
  }
  gifts = next;
  render();
}

function showCurrentPhoto() {
  byId("photo-tools").hidden = !oldPhoto;
  if (oldPhoto) byId("photo-preview").src = oldPhoto;
  else byId("photo-preview").removeAttribute("src");
}

function openEditor(gift) {
  editing = gift ?? null;
  form.reset();
  byId("error").textContent = "";
  byId("editor-title").textContent = gift ? "Edit gift" : "Add a gift";
  oldPhoto = gift?.image ?? "";
  for (const key of ["name", "size", "colour", "price", "link", "notes"]) {
    fields[key].value = gift?.[key] ?? "";
  }
  if (oldPhoto.startsWith("http")) fields.photo.value = oldPhoto;
  showCurrentPhoto();
  editor.showModal();
}

async function resizePhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const ratio = Math.min(1, 850 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", .82);
  } catch {
    throw new Error("This photo could not open. Try a JPG, PNG, or photo link.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function askToRemove(gift) {
  removing = gift.id;
  removeDialog.returnValue = "";
  byId("remove-name").textContent = gift.name;
  removeDialog.showModal();
}

removeDialog.addEventListener("close", () => {
  if (removeDialog.returnValue !== "remove") return;
  try {
    persist(gifts.filter((gift) => gift.id !== removing));
    byId("status").textContent = "Gift removed.";
    byId("add").focus();
  } catch (error) {
    byId("status").textContent = error.message;
  }
});

for (const id of ["add", "first"]) byId(id).addEventListener("click", () => openEditor());
for (const id of ["close", "cancel"]) byId(id).addEventListener("click", () => editor.close());
byId("clear-photo").addEventListener("click", () => {
  oldPhoto = "";
  fields.photo.value = "";
  fields.upload.value = "";
  showCurrentPhoto();
});
editor.addEventListener("cancel", (event) => {
  if (byId("save").disabled) event.preventDefault();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const save = byId("save");
  if (save.disabled) return;
  const data = new FormData(form);
  const read = (key) => String(data.get(key)).trim();
  const original = editing;
  const previousImage = oldPhoto;
  save.disabled = true;
  byId("close").disabled = true;
  byId("cancel").disabled = true;
  byId("error").textContent = "";
  try {
    const name = read("name");
    if (!name) throw new Error("Enter a gift name.");
    const link = webAddress(read("link"));
    const file = data.get("upload");
    const image = file.size
      ? await resizePhoto(file)
      : webAddress(read("photo")) || (previousImage.startsWith("data:") ? previousImage : "");
    const gift = {
      id: original?.id ?? crypto.randomUUID(),
      name, link, image, size: read("size"), colour: read("colour"),
      price: read("price"), notes: read("notes")
    };
    persist(original ? gifts.map((item) => item.id === gift.id ? gift : item) : [gift, ...gifts]);
    editor.close();
    byId("status").textContent = original ? "Gift updated." : "Gift added.";
    byId("add").focus();
  } catch (error) {
    byId("error").textContent = error.message;
  } finally {
    save.disabled = false;
    byId("close").disabled = false;
    byId("cancel").disabled = false;
  }
});

render();

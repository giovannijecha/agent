const button = document.querySelector("#counter");

button.addEventListener("click", () => {
  button.textContent = String(Number(button.textContent) + 1);
});

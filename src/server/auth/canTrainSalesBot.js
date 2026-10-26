export function canTrainSalesBot(user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return Boolean(user.canTrainSalesBot);
}

export function serializeUserFile(file) {
  const data = {
    id: file.id,
    name: file.name,
    content: file.content || "",
    createdAt: file.createdAt?.toISOString?.() ?? file.createdAt,
    updatedAt: file.updatedAt?.toISOString?.() ?? file.updatedAt,
  };

  if (file.owner) {
    data.owner = {
      id: file.owner.id,
      username: file.owner.username,
    };
  }

  return data;
}

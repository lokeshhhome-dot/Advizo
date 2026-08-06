export const isDummyConsultant = (consultant) => {
  if (!consultant) return false;

  const haystack = [
    consultant.fullname,
    consultant.email,
    consultant.profession,
    consultant.displayName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /(dummy|demo|test)/i.test(haystack);
};

import Link from "next/link";

// Button that opens the official scrutineering review screen.
export default function ScrutineeringReviewButton() {
  return (
    <Link
      href="/admin/scrutineering"
      style={{
        display: "block",
        boxSizing: "border-box",
        width: "100%",
        maxWidth: "420px",
        margin: "12px auto",
        padding: "16px",
        borderRadius: "10px",
        background: "#1e3a8a",
        color: "#ffffff",
        fontSize: "18px",
        fontWeight: 800,
        textAlign: "center",
        textDecoration: "none",
      }}
    >
      Scrutineering Review
    </Link>
  );
}

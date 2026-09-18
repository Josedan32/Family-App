import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Avatar, avatarColorIndex, avatarInitials } from "../ui/Avatar";

describe("avatarInitials", () => {
  it("takes the first letter of the first and last name", () => {
    expect(avatarInitials("Daniel Hernández")).toBe("DH");
  });

  it("falls back to a single initial for a one-word name", () => {
    expect(avatarInitials("Hermano")).toBe("H");
  });

  it("returns a placeholder for an empty name", () => {
    expect(avatarInitials("   ")).toBe("?");
  });
});

describe("avatarColorIndex", () => {
  it("is deterministic for the same seed", () => {
    expect(avatarColorIndex("member-1")).toBe(avatarColorIndex("member-1"));
  });

  it("stays within the palette range", () => {
    for (const seed of ["a", "member-1", "Daniel", ""]) {
      const index = avatarColorIndex(seed);
      expect(index).toBeGreaterThanOrEqual(1);
      expect(index).toBeLessThanOrEqual(8);
    }
  });

  it("usually differs between different seeds", () => {
    expect(avatarColorIndex("member-1")).not.toBe(avatarColorIndex("member-2"));
  });
});

describe("Avatar", () => {
  it("renders the photo when one is present", () => {
    const { container } = render(
      <Avatar displayName="Daniel" photoUrl="https://example.com/d.jpg" />,
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "https://example.com/d.jpg");
  });

  it("renders initials when there is no photo", () => {
    render(<Avatar displayName="Mamá Hernández" photoUrl={null} />);
    expect(screen.getByText("MH")).toBeInTheDocument();
  });

  it("colors the same seed the same way across renders", () => {
    const { container: a } = render(
      <Avatar displayName="Daniel" photoUrl={null} seed="member-1" />,
    );
    const { container: b } = render(
      <Avatar displayName="Daniel" photoUrl={null} seed="member-1" />,
    );
    expect(a.firstElementChild?.getAttribute("style")).toBe(
      b.firstElementChild?.getAttribute("style"),
    );
  });
});

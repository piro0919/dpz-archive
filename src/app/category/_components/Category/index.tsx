import { type Category } from "@prisma/client";
import Link from "next/link";
import React from "react";
import styles from "./style.module.css";

type CategoryWithCount = Category & {
  _count: {
    articles: number;
  };
};

export type CategoryProps = Readonly<{
  categories: CategoryWithCount[];
}>;

export default function Category({
  categories,
}: CategoryProps): React.JSX.Element {
  return (
    <div className={styles.container}>
      <ul className={styles.list}>
        {categories.map((category) => (
          <li key={category.id}>
            <Link className={styles.link} href={`/?category=${category.name}`}>
              <div className={styles.name}>{category.name}</div>
              <div className={styles.count}>
                {category._count.articles.toLocaleString()} 本
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

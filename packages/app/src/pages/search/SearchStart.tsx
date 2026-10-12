import SearchSuggest from "@/components/search-suggest/SearchSuggest";

export default function SearchStart() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8">
      <h1 className="mb-4 text-2xl font-bold">搜索音乐</h1>
      <SearchSuggest page />
    </div>
  );
}

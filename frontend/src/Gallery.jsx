import { useState, useEffect } from "react";
import { LuX, LuChevronLeft, LuChevronRight, LuCamera } from "react-icons/lu";
import useReveal from "./useReveal";

export default function Gallery() {
  const [selected, setSelected] = useState(null);
  const ref = useReveal();

  useEffect(() => {
    if (selected !== null) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [selected]);

  const images = [
    { src: "https://images.unsplash.com/photo-1566109964132-ec243417ca2d?w=800&h=600&fit=crop", caption: "Fresh coconuts ready for processing", category: "Coconuts" },
    { src: "https://images.unsplash.com/photo-1546662608-aec5228e9a74?w=800&h=600&fit=crop", caption: "Coconut farm harvest", category: "Farm" },
    { src: "https://images.unsplash.com/photo-1554444510-592779e6e009?w=800&h=600&fit=crop", caption: "Split coconut showing the white meat used for copra", category: "Drying" },
    { src: "https://images.unsplash.com/photo-1596663097529-c65b32a1f506?w=800&h=600&fit=crop", caption: "Coconut oil — the main product of copra", category: "Products" },
    { src: "https://images.unsplash.com/photo-1509278159101-02103f49328f?w=800&h=600&fit=crop", caption: "Handling coconut husk during processing", category: "Processing" },
    { src: "https://images.unsplash.com/photo-1603779046675-2eccbab9b982?w=800&h=600&fit=crop", caption: "Harvested coconuts at the buying station", category: "Station" },
  ];

  return (
    <div ref={ref}>
      <section className="relative overflow-hidden grain">
        <img src="https://images.unsplash.com/photo-1509278159101-02103f49328f?w=1920&h=1080&fit=crop" alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-green-dark/85 via-green-mid/80 to-brown-mid/85 animate-gradient" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-white/5 animate-float" />
        <div className="relative z-10 pt-28 sm:pt-36 pb-20 sm:pb-28 px-5 text-center text-white">
          <span className="inline-flex items-center gap-2 glass text-sm font-medium px-5 py-2 rounded-full mb-6 animate-fade-in-up">
            <LuCamera className="w-4 h-4" /> Our Operations
          </span>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold mb-4 animate-fade-in-up" style={{ animationDelay: "150ms" }}>
            Gallery
          </h1>
          <p className="text-lg sm:text-xl opacity-90 max-w-lg mx-auto animate-fade-in-up" style={{ animationDelay: "300ms" }}>
            A look at our copra buying operations, coconut farms, and the drying process
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-5 py-14 sm:py-28">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-7" data-reveal>
          {images.map((img, index) => (
            <button
              key={index}
              onClick={() => setSelected(index)}
              className={`reveal delay-${(index % 3 + 1) * 100} group bg-white rounded-3xl overflow-hidden shadow-card hover:shadow-card-hover transition-all duration-500 text-left hover:-translate-y-2 border border-beige-dark/20`}
            >
              <div className="overflow-hidden relative">
                <img
                  src={img.src}
                  alt={img.caption}
                  loading="lazy"
                  className="w-full h-48 sm:h-60 object-cover group-hover:scale-110 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-end p-4">
                  <span className="text-white text-sm font-medium">View larger</span>
                </div>
              </div>
              <div className="p-5">
                <span className="inline-block bg-green-pale text-green-dark text-xs font-bold px-3 py-1 rounded-full mb-2">
                  {img.category}
                </span>
                <p className="text-sm font-medium text-brown-dark leading-snug">
                  {img.caption}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {selected !== null && (
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5 animate-fade-in-up"
          onClick={() => setSelected(null)}
        >
          <div className="relative max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelected(null)}
              className="absolute -top-12 sm:-top-14 right-0 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <LuX className="w-5 h-5" />
            </button>
            <img
              src={images[selected].src}
              alt={images[selected].caption}
              className="w-full rounded-2xl sm:rounded-3xl shadow-2xl max-h-[75vh] sm:max-h-[80vh] object-contain"
            />
            <p className="text-white text-center mt-4 sm:mt-5 font-medium text-base sm:text-lg">{images[selected].caption}</p>
            <div className="flex justify-between mt-4 sm:mt-6 gap-3">
              <button
                onClick={() => setSelected(selected > 0 ? selected - 1 : images.length - 1)}
                className="flex items-center gap-1.5 sm:gap-2 glass hover:bg-white/20 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl transition-all duration-300 hover:-translate-x-1 text-sm sm:text-base"
              >
                <LuChevronLeft className="w-5 h-5" /> <span className="hidden sm:inline">Previous</span><span className="sm:hidden">Prev</span>
              </button>
              <button
                onClick={() => setSelected(selected < images.length - 1 ? selected + 1 : 0)}
                className="flex items-center gap-1.5 sm:gap-2 glass hover:bg-white/20 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl transition-all duration-300 hover:translate-x-1 text-sm sm:text-base"
              >
                Next <LuChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

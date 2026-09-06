import { Link } from "react-router-dom";
import BrandLogo from "./components/BrandLogo";

export default function Footer() {
  return (
    <footer className="bg-cream border-t border-beige-dark/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-5 py-14 sm:py-16">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-10">

          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 flex items-center justify-center">
                <BrandLogo className="w-full h-full" size="100%" />
              </div>
              <span className="text-sm font-extrabold text-brown-dark">NERC Copra Trading</span>
            </div>
            <p className="text-xs text-brown-light">Powered by CopTrax</p>
            <p className="text-xs text-brown-light mt-3">
              Poblacion, Kumalarang<br />Zamboanga del Sur
            </p>
          </div>

          <div className="flex flex-wrap gap-x-12 gap-y-8">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-brown-light mb-3">Site</p>
              <ul className="space-y-2 text-sm">
                <li><a href="/#top" className="text-brown-mid/90 hover:text-green-dark transition-colors duration-200">Home</a></li>
                <li><a href="/#why-nerc" className="text-brown-mid/90 hover:text-green-dark transition-colors duration-200">Why NERC</a></li>
                <li><a href="/#story" className="text-brown-mid/90 hover:text-green-dark transition-colors duration-200">How It Works</a></li>
                <li><a href="/#about" className="text-brown-mid/90 hover:text-green-dark transition-colors duration-200">About</a></li>
                <li><a href="/#contact" className="text-brown-mid/90 hover:text-green-dark transition-colors duration-200">Contact</a></li>
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-brown-light mb-3">Account</p>
              <ul className="space-y-2 text-sm">
                <li><Link to="/login" className="text-brown-mid/90 hover:text-green-dark transition-colors duration-200">Supplier Login</Link></li>
                <li><Link to="/register" className="text-brown-mid/90 hover:text-green-dark transition-colors duration-200">Register</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-brown-light mb-3">Learn More</p>
              <ul className="space-y-2 text-sm">
                <li><Link to="/what-is-copra" className="text-brown-mid/90 hover:text-green-dark transition-colors duration-200">What is Copra</Link></li>
                <li><Link to="/why-sell-to-us" className="text-brown-mid/90 hover:text-green-dark transition-colors duration-200">Why Sell to Us</Link></li>
                <li><Link to="/help" className="text-brown-mid/90 hover:text-green-dark transition-colors duration-200">Help &amp; Support</Link></li>
              </ul>
            </div>
          </div>

        </div>
      </div>

      <div className="border-t border-beige-dark/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-5 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-brown-light">
          <p>&copy; {new Date().getFullYear()} NERC Copra Trading. All rights reserved.</p>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/privacy-policy" className="hover:text-green-dark transition-colors duration-200">
              Privacy Policy
            </Link>
            <span aria-hidden="true">&middot;</span>
            <Link to="/terms" className="hover:text-green-dark transition-colors duration-200">
              Terms &amp; Conditions
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}


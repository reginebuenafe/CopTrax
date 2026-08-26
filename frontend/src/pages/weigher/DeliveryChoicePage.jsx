import { useNavigate } from "react-router-dom";
import { LuTruck, LuFileText, LuArrowRight } from "react-icons/lu";
import { useAuth } from "../../contexts/AuthContext";

export default function DeliveryChoicePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-brown-dark">
          Good day, {profile?.first_name}!
        </h1>
        <p className="text-brown-light mt-2 text-base">Select the type of delivery to record.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
        {/* Walk-in */}
        <button
          onClick={() => navigate("/dashboard/weigher/walkin")}
          className="group bg-white rounded-3xl shadow-card border border-beige-dark/20 p-8 text-left
            hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300"
        >
          <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mb-6
            group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
            <LuTruck className="w-8 h-8 text-orange-500" />
          </div>
          <h2 className="text-xl font-bold text-brown-dark mb-4">Walk-in Delivery</h2>
          <div className="flex items-center gap-1.5 text-orange-500 font-semibold text-sm group-hover:gap-3 transition-all duration-300">
            Record Walk-in <LuArrowRight className="w-4 h-4" />
          </div>
        </button>

        {/* Contractual */}
        <button
          onClick={() => navigate("/dashboard/weigher/contractual")}
          className="group bg-white rounded-3xl shadow-card border border-beige-dark/20 p-8 text-left
            hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300"
        >
          <div className="w-16 h-16 bg-green-pale rounded-2xl flex items-center justify-center mb-6
            group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
            <LuFileText className="w-8 h-8 text-green-dark" />
          </div>
          <h2 className="text-xl font-bold text-brown-dark mb-4">Contractual Delivery</h2>
          <div className="flex items-center gap-1.5 text-green-dark font-semibold text-sm group-hover:gap-3 transition-all duration-300">
            Record Contractual <LuArrowRight className="w-4 h-4" />
          </div>
        </button>
      </div>
    </div>
  );
}

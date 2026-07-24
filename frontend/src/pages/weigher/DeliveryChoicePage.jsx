import { useNavigate } from "react-router-dom";
import { LuTruck, LuFileText, LuArrowRight } from "react-icons/lu";
import { useAuth } from "../../contexts/AuthContext";

export default function DeliveryChoicePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-brown-dark">
          Good day, {profile?.first_name}!
        </h1>
        <p className="text-brown-light mt-1">Select the type of delivery to record.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl">
        {/* Walk-in */}
        <button
          onClick={() => navigate("/dashboard/weigher/walkin")}
          className="group bg-white rounded-3xl shadow-card border border-beige-dark/20 p-8 text-left
            hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300"
        >
          <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center mb-5
            group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
            <LuTruck className="w-7 h-7 text-orange-500" />
          </div>
          <h2 className="text-lg font-bold text-brown-dark mb-2">Walk-in Delivery</h2>
          <p className="text-brown-light text-sm leading-relaxed mb-5">
            Supplier arrives without a contract. Record their details, weight, and settle in cash.
            No contract link required.
          </p>
          <div className="flex items-center gap-1.5 text-orange-500 font-semibold text-sm group-hover:gap-2.5 transition-all duration-300">
            Record Walk-in <LuArrowRight className="w-4 h-4" />
          </div>
        </button>

        {/* Contractual */}
        <button
          onClick={() => navigate("/dashboard/weigher/contractual")}
          className="group bg-white rounded-3xl shadow-card border border-beige-dark/20 p-8 text-left
            hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300"
        >
          <div className="w-14 h-14 bg-green-pale rounded-2xl flex items-center justify-center mb-5
            group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
            <LuFileText className="w-7 h-7 text-green-dark" />
          </div>
          <h2 className="text-lg font-bold text-brown-dark mb-2">Contractual Delivery</h2>
          <p className="text-brown-light text-sm leading-relaxed mb-5">
            Supplier has an active contract with NERC. Select the contract and record the weight.
            Payment will be processed electronically.
          </p>
          <div className="flex items-center gap-1.5 text-green-dark font-semibold text-sm group-hover:gap-2.5 transition-all duration-300">
            Record Contractual <LuArrowRight className="w-4 h-4" />
          </div>
        </button>
      </div>
    </div>
  );
}

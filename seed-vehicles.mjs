import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Sample vehicles to seed
const sampleVehicles = [
  {
    year: 2022,
    make: 'Honda',
    model: 'Civic',
    trim: 'Sport',
    vin: '2HGFC2F59NH123456',
    mileage: 15000,
    condition: 'used',
    asking_price: 24995,
    dealer_name: 'AutoNation Honda',
    dealer_city: 'Tampa',
    dealer_state: 'FL',
    photo_url: 'https://images.unsplash.com/photo-1590362891991-f776e747a588?w=400'
  },
  {
    year: 2023,
    make: 'Toyota',
    model: 'RAV4',
    trim: 'XLE Premium',
    vin: 'JTMW1RFV8PD123789',
    mileage: 8500,
    condition: 'certified',
    asking_price: 34990,
    dealer_name: 'CarMax',
    dealer_city: 'Orlando',
    dealer_state: 'FL',
    photo_url: 'https://images.unsplash.com/photo-1581540222194-0def2dda95b8?w=400'
  },
  {
    year: 2024,
    make: 'Ford',
    model: 'F-150',
    trim: 'Lariat',
    vin: '1FTFW1E84PFA12345',
    mileage: 2100,
    condition: 'new',
    asking_price: 52800,
    dealer_name: 'Sunshine Ford',
    dealer_city: 'Miami',
    dealer_state: 'FL',
    photo_url: 'https://images.unsplash.com/photo-1587315321485-7a0f0a27a0f7?w=400'
  },
  {
    year: 2021,
    make: 'Tesla',
    model: 'Model 3',
    trim: 'Long Range',
    vin: '5YJ3E1EA8MF123456',
    mileage: 22000,
    condition: 'used',
    asking_price: 38500,
    dealer_name: 'Carvana',
    dealer_city: 'Jacksonville',
    dealer_state: 'FL',
    photo_url: 'https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=400'
  },
  {
    year: 2023,
    make: 'Chevrolet',
    model: 'Silverado 1500',
    trim: 'LT Trail Boss',
    vin: '1GCUDEED3PZ123456',
    mileage: 12000,
    condition: 'certified',
    asking_price: 45995,
    dealer_name: 'Gator Chevrolet',
    dealer_city: 'Gainesville',
    dealer_state: 'FL',
    photo_url: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=400'
  },
  {
    year: 2022,
    make: 'Mazda',
    model: 'CX-5',
    trim: 'Turbo Signature',
    vin: 'JM3KFBDM5N0123456',
    mileage: 18500,
    condition: 'used',
    asking_price: 32990,
    dealer_name: 'Vroom',
    dealer_city: 'Clearwater',
    dealer_state: 'FL',
    photo_url: 'https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=400'
  },
  {
    year: 2024,
    make: 'Hyundai',
    model: 'Tucson',
    trim: 'SEL Convenience',
    vin: '5NMJB3AE1RH123456',
    mileage: 500,
    condition: 'new',
    asking_price: 29800,
    dealer_name: 'Hyundai of St. Petersburg',
    dealer_city: 'St. Petersburg',
    dealer_state: 'FL',
    photo_url: 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?w=400'
  },
  {
    year: 2021,
    make: 'Subaru',
    model: 'Outback',
    trim: 'Limited XT',
    vin: '4S4BTANC8M3123456',
    mileage: 28000,
    condition: 'used',
    asking_price: 31500,
    dealer_name: 'AutoTrader Direct',
    dealer_city: 'Tallahassee',
    dealer_state: 'FL',
    photo_url: 'https://images.unsplash.com/photo-1619725002198-6a689b72f41d?w=400'
  }
];

async function seedVehicles() {
  try {
    console.log('[seed] Starting vehicles table seed...');

    // Get the first user from the auth.users table
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id')
      .limit(1);

    if (userError) {
      console.error('[seed] Error fetching user:', userError);
      return;
    }

    if (!users || users.length === 0) {
      console.error('[seed] No users found in database');
      return;
    }

    const userId = users[0].id;
    console.log(`[seed] Using user ID: ${userId}`);

    // Add user_id to all sample vehicles
    const vehiclesWithUserId = sampleVehicles.map(vehicle => ({
      ...vehicle,
      user_id: userId
    }));

    // Insert vehicles
    const { data, error } = await supabase
      .from('vehicles')
      .insert(vehiclesWithUserId)
      .select();

    if (error) {
      console.error('[seed] Error inserting vehicles:', error);
      return;
    }

    console.log(`[seed] Successfully inserted ${data.length} vehicles`);
    console.log('[seed] Sample vehicles:');
    data.forEach((v, i) => {
      console.log(`  ${i + 1}. ${v.year} ${v.make} ${v.model} - $${v.asking_price.toLocaleString()} (${v.dealer_name})`);
    });

  } catch (err) {
    console.error('[seed] Unexpected error:', err);
  }
}

seedVehicles();

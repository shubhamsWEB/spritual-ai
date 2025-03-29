-- This SQL file contains all the commands needed to set up your Supabase database tables
-- You can run these commands in the SQL Editor in your Supabase dashboard

-- Create profiles table to store user profile data
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  username TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  preferences JSONB DEFAULT '{}'::jsonb
);

-- Set up Row Level Security (RLS) for profiles table
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create secure policies for the profiles table
CREATE POLICY "Users can view their own profile" 
  ON profiles FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" 
  ON profiles FOR INSERT 
  WITH CHECK (auth.uid() = id);

-- Create query_history table to store user queries and responses
CREATE TABLE query_history (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  language TEXT DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Set up Row Level Security for query_history table
ALTER TABLE query_history ENABLE ROW LEVEL SECURITY;

-- Create secure policies for the query_history table
CREATE POLICY "Users can view their own queries" 
  ON query_history FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own queries" 
  ON query_history FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own queries" 
  ON query_history FOR DELETE 
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX query_history_user_id_idx ON query_history(user_id);
CREATE INDEX query_history_created_at_idx ON query_history(created_at);

-- Create function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create a profile when a new user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Optional: Create stored procedures for common operations

-- Get user's recent queries with pagination
CREATE OR REPLACE FUNCTION get_user_recent_queries(
  user_uuid UUID,
  page_size INT DEFAULT 10,
  page_number INT DEFAULT 1
) 
RETURNS TABLE (
  id UUID,
  query TEXT,
  response TEXT,
  language TEXT,
  created_at TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT qh.id, qh.query, qh.response, qh.language, qh.created_at
  FROM query_history qh
  WHERE qh.user_id = user_uuid
  ORDER BY qh.created_at DESC
  LIMIT page_size
  OFFSET (page_number - 1) * page_size;
END;
$$;